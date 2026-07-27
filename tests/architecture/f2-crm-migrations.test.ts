import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (name: string) =>
  readFileSync(path.join(root, "supabase/migrations", name), "utf8").toLowerCase();
const schema = read("20260727230000_f2_1_crm_contact_schema.sql");
const permissions = read("20260727231000_f2_1_crm_permissions.sql");
const rpcs = read("20260727232000_f2_1_crm_write_rpcs.sql");

const tables = ["contacts", "person_contacts", "patients", "lead_sources"];
const rpcNames = [
  "create_contact",
  "update_contact",
  "archive_contact",
  "assign_contact_owner",
  "add_contact_method",
  "update_contact_method",
  "archive_contact_method",
  "set_primary_contact_method",
  "link_contact_as_patient",
  "unlink_contact_as_patient",
  "create_lead_source",
  "update_lead_source",
  "archive_lead_source",
];

describe("migrations de contatos F2.1", () => {
  it("cria as quatro tabelas com ENABLE/FORCE RLS e somente SELECT", () => {
    for (const table of tables) {
      expect(schema).toContain(`create table public.${table}`);
      expect(schema).toContain(`alter table public.${table} enable row level security`);
      expect(schema).toContain(`alter table public.${table} force row level security`);
      expect(schema).toContain(`create policy ${table}_select`);
    }
    expect(schema).not.toMatch(/for (?:insert|update|delete)\s+to authenticated/);
  });

  it("preserva o contato e anula somente o owner ao remover o membro", () => {
    expect(schema).toContain("foreign key (clinic_id, owner_user_id)");
    expect(schema).toContain("on delete set null (owner_user_id)");
    expect(schema).not.toContain("on delete cascade (owner_user_id)");
  });

  it("mantém deduplicação, idempotência, versão e principal no banco", () => {
    expect(schema).toContain("person_contacts_active_value_key");
    expect(schema).toContain("person_contacts_primary_kind_key");
    expect(schema).toContain("contacts_clinic_idempotency_key");
    expect(schema).toContain("version integer not null default 1");
    expect(schema).toContain("normalized_value ~ '^\\+[1-9][0-9]{7,14}$'");
  });

  it("semeia exatamente sete novas permissões com chaves de dois segmentos", () => {
    const keys = [...permissions.matchAll(/\('([a-z_]+\.[a-z_]+)'\)/g)].map(
      (match) => match[1],
    );
    expect(new Set(keys)).toEqual(
      new Set([
        "contact.view_own",
        "contact.view_all",
        "contact.create",
        "contact.edit_own",
        "contact.edit_all",
        "contact.archive",
        "lead_source.manage",
      ]),
    );
  });

  it("expõe exatamente as treze RPCs e nenhuma exige AAL2", () => {
    const created = [...rpcs.matchAll(/create function public\.([a-z_]+)/g)].map(
      (match) => match[1],
    );
    expect(created).toEqual(rpcNames);
    expect(rpcs).not.toContain("require_aal2");
    for (const rpc of rpcNames) {
      expect(rpcs).toContain(`alter function public.${rpc}`);
      expect(rpcs).toContain(`grant execute on function public.${rpc}`);
      expect(rpcs).toContain(`revoke all on function public.${rpc}`);
    }
  });

  it("não coloca valores de contato na auditoria", () => {
    const auditCalls = rpcs
      .split("perform app_private.log_audit_event(")
      .slice(1)
      .map((fragment) => fragment.slice(0, fragment.indexOf(");")))
      .join("\n");
    expect(auditCalls).not.toMatch(/raw_value|normalized_value/);
  });
});
