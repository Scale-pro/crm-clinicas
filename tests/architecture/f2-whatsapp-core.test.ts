import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");
const schema = read("supabase/migrations/20260730100000_f2_whatsapp_core_schema.sql").toLowerCase();
const rpcs = read("supabase/migrations/20260730101000_f2_whatsapp_core_rpcs.sql").toLowerCase();
const accounts = read("supabase/migrations/20260730102000_f2_whatsapp_account_provisioning.sql").toLowerCase();
const moduleApi = read("src/modules/whatsapp/index.ts");
const ingest = read("src/modules/whatsapp/ingest.ts");

const tables = [
  "whatsapp_accounts", "whatsapp_webhook_events", "conversations", "messages",
  "message_status_events", "conversation_assignments", "message_delivery_attempts",
];

describe("núcleo WhatsApp multi-tenant", () => {
  it("cria somente as sete entidades previstas com clinic_id e RLS forçada", () => {
    for (const table of tables) {
      expect(schema).toContain(`create table public.${table}`);
      expect(schema).toContain(`alter table public.${table} enable row level security`);
      expect(schema).toContain(`alter table public.${table} force row level security`);
    }
    expect(schema).not.toMatch(/meta_ads|google_ads|pixel|conversion_api|\bai_/);
  });

  it("usa FKs compostas e índices operacionais tenant-first", () => {
    expect(schema).toContain("foreign key (clinic_id, whatsapp_account_id)");
    expect(schema).toContain("foreign key (clinic_id, conversation_id)");
    expect(schema).toContain("foreign key (clinic_id, contact_id)");
    expect(schema).toContain("foreign key (clinic_id, opportunity_id)");
    for (const match of schema.matchAll(/create (?:unique )?index ([a-z0-9_]+)\s+on public\.[a-z0-9_]+\(([^)]+)/g)) {
      if (match[1]?.startsWith("messages_clinic") || match[1]?.includes("_clinic_")) {
        expect(match[2]?.trim().startsWith("clinic_id")).toBe(true);
      }
    }
  });

  it("não concede payload bruto nem escrita direta a authenticated", () => {
    expect(schema).not.toContain("whatsapp_webhook_events_select");
    expect(schema).not.toMatch(/grant select on table[^;]*whatsapp_webhook_events[^;]*to authenticated/);
    expect(schema).not.toMatch(/grant (?:insert|update|delete)[^;]*to authenticated/);
  });

  it("restringe ingest, processamento, status e retry à service role", () => {
    for (const rpc of [
      "ingest_whatsapp_event", "process_whatsapp_message",
      "record_whatsapp_message_status", "retry_whatsapp_event",
    ]) {
      const fragment = rpcs.split(`create function public.${rpc}`)[1]!;
      expect(fragment).toContain("security definer");
      expect(fragment).toContain("set search_path = ''");
      expect(fragment).toContain(`grant execute on function public.${rpc}`);
      expect(fragment.split(";")[0]).toBeTruthy();
    }
    expect(rpcs).not.toMatch(/grant execute on function public\.(?:ingest|process|record|retry)_whatsapp[^;]+to authenticated/);
  });

  it("impede regressão de status e mantém histórico aplicado/ignorado", () => {
    expect(rpcs).toContain("v_new_rank >= v_current_rank");
    expect(rpcs).toContain("coalesce(current_status, '') <> 'read'");
    const statusRpc = rpcs.split("create function public.record_whatsapp_message_status")[1]!
      .split("create function public.retry_whatsapp_event")[0]!;
    expect(statusRpc).not.toContain("do update");
    expect(schema).toContain("applied boolean not null");
  });

  it("serializa mensagem externa antes de resolver contato e oportunidade", () => {
    const lock = rpcs.indexOf("v_event.whatsapp_account_id::text || ':' || p_external_message_id, 75");
    const resolve = rpcs.indexOf("from app_private.resolve_whatsapp_lead(");
    expect(lock).toBeGreaterThan(0);
    expect(lock).toBeLessThan(resolve);
  });

  it("expõe todos os contratos públicos e usa somente a API pública do CRM", () => {
    for (const name of [
      "ingestWhatsAppEvent", "listConversations", "getConversation",
      "listConversationMessages", "assignConversation", "markConversationRead",
      "closeConversation", "reopenConversation",
    ]) expect(moduleApi).toContain(name);
    expect(ingest).toContain('from "@/modules/crm"');
    expect(ingest).not.toMatch(/@\/modules\/crm\//);
  });


  it("provisiona conta por RPC autorizada, nunca por escrita direta", () => {
    // Sem esta RPC não há caminho autorizado para ligar a integração, e a
    // ingestão falha sempre em 'whatsapp account not found'.
    expect(accounts).toContain("create function public.create_whatsapp_account");
    expect(accounts).toContain("security definer");
    expect(accounts).toContain("set search_path = ''");
    expect(accounts).toContain("app_private.is_clinic_member(clinic_id)");
    expect(accounts).toContain("app_private.has_permission(clinic_id, 'clinic.manage')");
    expect(accounts).toContain("app_private.require_aal2()");
    expect(accounts).toContain("revoke all on function public.create_whatsapp_account");
    // clinic_id de parâmetro nunca autoriza sozinho: is_clinic_member e
    // has_permission revalidam o vínculo antes de qualquer escrita.
    expect(accounts.indexOf("app_private.has_permission")).toBeLessThan(
      accounts.indexOf("insert into public.whatsapp_accounts"),
    );
    expect(accounts).not.toMatch(/to (?:anon|service_role)\b/);
  });

  it("não deixa evento persistido sem caminho de recuperação", () => {
    // O evento persiste antes da fila; se o enfileiramento não acontecer, ele
    // fica 'pending'. Os dois caminhos de volta precisam existir.
    expect(rpcs).toContain("in ('pending', 'failed', 'dead')");
    expect(ingest).not.toMatch(/if \(persisted\.duplicate\)\s*\{\s*return/);
    expect(ingest).toContain('code: "not_queued"');
  });

  it("não toca frontend nem acopla o domínio a provedor", () => {
    expect(`${schema}\n${rpcs}\n${accounts}`).not.toMatch(/waha|evolution|cloud api/);
    expect(moduleApi.startsWith('import "server-only";')).toBe(true);
  });
});
