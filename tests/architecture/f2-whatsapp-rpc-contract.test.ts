import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/auth", () => ({ requirePermission: vi.fn() }));
vi.mock("@/shared/db", () => ({ createServerSupabaseClient: vi.fn() }));

let api: typeof import("@/modules/whatsapp");

beforeAll(async () => {
  api = await import("@/modules/whatsapp");
});

/*
 * `WhatsAppRpcExecutor` é uma porta deliberadamente sem tipo
 * (`rpc(name: string, args: Record<string, unknown>)`), então nem o TypeScript
 * nem os tipos gerados em shared/db conferem os nomes de RPC e de parâmetro que
 * rpc-store.ts envia. Um `p_external_messsage_id` com typo compila, passa no
 * lint e só falha contra o banco — que os testes de unidade não têm, porque
 * dublam o executor.
 *
 * Este teste fecha essa costura sem exigir Docker: captura as chamadas que o
 * store faz e confere cada uma contra a assinatura declarada na migration.
 */

const rpcs = readFileSync(
  path.resolve(
    __dirname,
    "../../supabase/migrations/20260730101000_f2_whatsapp_core_rpcs.sql",
  ),
  "utf8",
);

/** Lê os nomes de parâmetro declarados em `create function public.<nome>(...)`. */
function declaredParameters(functionName: string): Set<string> {
  const marker = `create function public.${functionName}(`;
  const start = rpcs.indexOf(marker);
  expect(
    start,
    `A RPC public.${functionName} não existe na migration. rpc-store.ts a chama; ` +
      `se ela foi renomeada, atualize os dois lados.`,
  ).toBeGreaterThan(-1);

  const signature = rpcs.slice(start + marker.length, rpcs.indexOf(")", start));
  return new Set(
    [...signature.matchAll(/\b(p_[a-z0-9_]+)\s+[a-z]/g)].map((match) => match[1]!),
  );
}

type Call = { name: string; args: Record<string, unknown> };

/** Executor que registra a chamada em vez de ir ao banco. */
function recordingExecutor(data: unknown) {
  const calls: Call[] = [];
  return {
    calls,
    executor: {
      rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        return Promise.resolve({ data, error: null });
      },
    },
  };
}

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const MESSAGE_ID = "22222222-2222-4222-8222-222222222222";
const CONTACT_ID = "33333333-3333-4333-8333-333333333333";
const CONVERSATION_ID = "44444444-4444-4444-8444-444444444444";
const OPPORTUNITY_ID = "55555555-5555-4555-8555-555555555555";

function expectMatchesSignature(call: Call) {
  const declared = declaredParameters(call.name);
  const sent = Object.keys(call.args).sort();

  const unknownArgs = sent.filter((key) => !declared.has(key));
  const missingArgs = [...declared].filter((key) => !(key in call.args)).sort();

  expect(
    unknownArgs,
    `rpc-store.ts envia parâmetro que public.${call.name} não declara: ` +
      `${unknownArgs.join(", ")}. Postgres resolveria a chamada como "função não ` +
      `encontrada" em runtime. Corrija o nome no store ou na migration.`,
  ).toEqual([]);

  expect(
    missingArgs,
    `rpc-store.ts não envia parâmetro declarado por public.${call.name}: ` +
      `${missingArgs.join(", ")}. Nenhum deles tem default na migration, então a ` +
      `chamada falha em runtime. Acrescente o argumento no store.`,
  ).toEqual([]);
}

describe("contrato entre rpc-store.ts e as RPCs do WhatsApp", () => {
  it("chama ingest_whatsapp_event com a assinatura declarada", async () => {
    const { calls, executor } = recordingExecutor([
      { duplicate: false, event_id: EVENT_ID },
    ]);
    await api.createWhatsAppRpcStore(executor).ingest({
      accountExternalId: "account-external",
      eventType: "messages.upsert",
      externalEventId: "external-event",
      provider: "provider_test",
      rawPayload: { fixture: true },
    });

    expect(calls).toHaveLength(1);
    expectMatchesSignature(calls[0]!);
  });

  it("chama process_whatsapp_message com a assinatura declarada", async () => {
    const { calls, executor } = recordingExecutor([
      {
        contact_id: CONTACT_ID,
        conversation_id: CONVERSATION_ID,
        duplicate: false,
        error_code: null,
        event_id: EVENT_ID,
        message_id: MESSAGE_ID,
        opportunity_id: OPPORTUNITY_ID,
      },
    ]);
    await api.createWhatsAppRpcStore(executor).processMessage({
      attachmentMetadata: {},
      contactName: "Contato Fictício",
      direction: "inbound",
      eventId: EVENT_ID,
      externalMessageId: "external-message",
      messageType: "text",
      occurredAt: "2026-07-30T12:00:00.000Z",
      phoneE164: "+5511999999999",
      providerPayloadType: "text",
      textContent: "mensagem fictícia",
    });

    expect(calls).toHaveLength(1);
    expectMatchesSignature(calls[0]!);
  });

  it("chama retry_whatsapp_event com a assinatura declarada", async () => {
    const { calls, executor } = recordingExecutor(true);
    await api.createWhatsAppRpcStore(executor).retry(EVENT_ID);

    expect(calls).toHaveLength(1);
    expectMatchesSignature(calls[0]!);
  });

  it("chama record_whatsapp_message_status com a assinatura declarada", async () => {
    const { calls, executor } = recordingExecutor([
      { applied: true, current_status: "delivered", message_id: MESSAGE_ID },
    ]);
    const result = await api.recordWhatsAppMessageStatus(
      {
        externalMessageId: "external-message",
        occurredAt: "2026-07-30T12:00:00.000Z",
        status: "delivered",
        webhookEventId: EVENT_ID,
      },
      executor,
    );

    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expectMatchesSignature(calls[0]!);
  });

  it("cobre toda RPC de service role que a migration declara", () => {
    // Se uma RPC nova entrar na migration sem chegar ao store, este teste falha
    // e obriga a decisão explícita: ou o store passa a expô-la, ou ela entra na
    // lista de exceções abaixo com o motivo.
    const serviceRoleRpcs = [
      ...rpcs.matchAll(/grant execute on function public\.(\w+)\([^)]*\)\s+to service_role/g),
    ].map((match) => match[1]!);

    expect(new Set(serviceRoleRpcs)).toEqual(
      new Set([
        "ingest_whatsapp_event",
        "process_whatsapp_message",
        "record_whatsapp_message_status",
        "retry_whatsapp_event",
      ]),
    );
  });
});
