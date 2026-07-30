import type { QueryResultRow } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestAdminClient, createTestUserClient } from "./helpers/create-test-admin-client";
import { createTestDbPool } from "./helpers/create-test-db-client";

const password = "Local-only-test-password-123!";
const pool = createTestDbPool();
const admin = createTestAdminClient();
const userIds: string[] = [];
const clinicIds: string[] = [];

type FixtureUser = Awaited<ReturnType<typeof createUser>>;
let ownerA: FixtureUser;
let ownerB: FixtureUser;
let managerA: FixtureUser;
let sdrA: FixtureUser;
let clinicA: string;
let clinicB: string;
let accountA: string;
let accountB: string;

async function createUser(label: string) {
  const email = `${label}-${crypto.randomUUID()}@example.test`;
  const created = await admin.auth.admin.createUser({ email, email_confirm: true, password });
  if (created.error || !created.data.user) throw created.error;
  userIds.push(created.data.user.id);
  const client = createTestUserClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { client, id: created.data.user.id };
}

async function asServiceRole<T extends QueryResultRow>(
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role service_role");
    const result = await client.query<T>(sql, values);
    await client.query("commit");
    return result.rows;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function ingest(
  accountExternalId: string,
  externalEventId = crypto.randomUUID(),
  eventType = "message.received",
) {
  const rows = await asServiceRole<{ duplicate: boolean; event_id: string }>(
    `select * from public.ingest_whatsapp_event($1, $2, $3, $4, $5::jsonb)`,
    ["provider_test", accountExternalId, externalEventId, eventType, JSON.stringify({ fixture: true })],
  );
  return rows[0]!;
}

async function processMessage(
  eventId: string,
  options: Partial<{
    direction: "inbound" | "outbound";
    externalMessageId: string;
    messageType: string;
    phone: string;
    providerPayloadType: string | null;
  }> = {},
) {
  const rows = await asServiceRole<{
    contact_id: string | null;
    conversation_id: string | null;
    duplicate: boolean;
    error_code: string | null;
    event_id: string;
    message_id: string | null;
    opportunity_id: string | null;
  }>(
    `select * from public.process_whatsapp_message(
       $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10
     )`,
    [
      eventId,
      options.externalMessageId ?? crypto.randomUUID(),
      options.direction ?? "inbound",
      options.phone ?? "+5511999999999",
      "Contato WhatsApp Fictício",
      options.messageType ?? "text",
      "Mensagem fictícia",
      JSON.stringify({ mimeType: "text/plain" }),
      options.providerPayloadType ?? "text",
      new Date().toISOString(),
    ],
  );
  return rows[0]!;
}

beforeAll(async () => {
  ownerA = await createUser("wa-owner-a");
  ownerB = await createUser("wa-owner-b");
  managerA = await createUser("wa-manager-a");
  sdrA = await createUser("wa-sdr-a");
  const clinics = await pool.query<{ id: string; name: string }>(
    `insert into public.clinics(name, slug, timezone, created_by) values
       ('Clínica WhatsApp Fictícia A', $1, 'America/Sao_Paulo', $3),
       ('Clínica WhatsApp Fictícia B', $2, 'America/Sao_Paulo', $4)
     returning id, name`,
    [`wa-a-${crypto.randomUUID()}`, `wa-b-${crypto.randomUUID()}`, ownerA.id, ownerB.id],
  );
  clinicA = clinics.rows.find((row) => row.name.endsWith("A"))!.id;
  clinicB = clinics.rows.find((row) => row.name.endsWith("B"))!.id;
  clinicIds.push(clinicA, clinicB);
  await pool.query(
    `insert into public.clinic_members(clinic_id, user_id, role) values
       ($1, $3, 'owner'), ($2, $4, 'owner'),
       ($1, $5, 'manager'), ($1, $6, 'sdr')`,
    [clinicA, clinicB, ownerA.id, ownerB.id, managerA.id, sdrA.id],
  );
  const accounts = await pool.query<{ clinic_id: string; id: string }>(
    `insert into public.whatsapp_accounts(
       clinic_id, provider, external_account_id, display_phone_e164, configured_by
     ) values
       ($1, 'provider_test', 'account-a', '+5511000000001', $3),
       ($2, 'provider_test', 'account-b', '+5511000000002', $4)
     returning id, clinic_id`,
    [clinicA, clinicB, ownerA.id, ownerB.id],
  );
  accountA = accounts.rows.find((row) => row.clinic_id === clinicA)!.id;
  accountB = accounts.rows.find((row) => row.clinic_id === clinicB)!.id;
});

afterAll(async () => {
  const failures: unknown[] = [];
  const attempt = async (cleanup: () => Promise<unknown>) => {
    try { await cleanup(); } catch (error) { failures.push(error); }
  };
  if (clinicIds.length) {
    for (const table of [
      "message_delivery_attempts", "conversation_assignments", "message_status_events",
    ]) {
      await attempt(() => pool.query(`delete from public.${table} where clinic_id = any($1::uuid[])`, [clinicIds]));
    }
    await attempt(() => pool.query(
      "update public.conversations set last_message_id = null where clinic_id = any($1::uuid[])", [clinicIds],
    ));
    for (const table of [
      "messages", "conversations", "whatsapp_webhook_events", "whatsapp_accounts",
      "opportunity_stage_events", "activities", "opportunities", "pipeline_stages",
      "pipelines", "person_contacts", "contacts",
    ]) {
      await attempt(() => pool.query(`delete from public.${table} where clinic_id = any($1::uuid[])`, [clinicIds]));
    }
    await attempt(() => pool.query("delete from public.clinics where id = any($1::uuid[])", [clinicIds]));
  }
  for (const userId of userIds) {
    await attempt(() => admin.auth.admin.deleteUser(userId));
  }
  await attempt(() => pool.end());
  if (failures.length) throw new AggregateError(failures, "Falha no cleanup das fixtures WhatsApp");
});

describe("núcleo WhatsApp em banco real", () => {
  it("resolve conta no servidor e deduplica o evento", async () => {
    const externalEventId = crypto.randomUUID();
    const first = await ingest("account-a", externalEventId);
    const replay = await ingest("account-a", externalEventId);
    expect(first.duplicate).toBe(false);
    expect(replay).toEqual({ duplicate: true, event_id: first.event_id });
    await expect(ingest("missing-account")).rejects.toThrow(/whatsapp account not found/);
  });

  it("processa inbound e converge contato, conversa, mensagem e oportunidade", async () => {
    const event = await ingest("account-a");
    const first = await processMessage(event.event_id, { phone: "+5511988880001" });
    const replay = await processMessage(event.event_id, {
      externalMessageId: crypto.randomUUID(), phone: "+5511988880001",
    });
    expect(first.error_code).toBeNull();
    expect(first.message_id).toBeTruthy();
    expect(replay).toMatchObject({
      contact_id: first.contact_id, conversation_id: first.conversation_id,
      duplicate: true, message_id: first.message_id, opportunity_id: first.opportunity_id,
    });
    const counts = await pool.query<{ contacts: string; conversations: string; messages: string; opportunities: string }>(
      `select
        (select count(*) from public.contacts where clinic_id = $1 and id = $2)::text contacts,
        (select count(*) from public.opportunities where clinic_id = $1 and id = $3)::text opportunities,
        (select count(*) from public.conversations where clinic_id = $1 and id = $4)::text conversations,
        (select count(*) from public.messages where clinic_id = $1 and id = $5)::text messages`,
      [clinicA, first.contact_id, first.opportunity_id, first.conversation_id, first.message_id],
    );
    expect(counts.rows[0]).toEqual({ contacts: "1", conversations: "1", messages: "1", opportunities: "1" });
  });

  it("resolve concorrência de contato e oportunidade sem duplicar", async () => {
    const [eventA, eventB] = await Promise.all([ingest("account-a"), ingest("account-a")]);
    const [messageA, messageB] = await Promise.all([
      processMessage(eventA.event_id, { phone: "+5511988880002" }),
      processMessage(eventB.event_id, { phone: "+5511988880002" }),
    ]);
    expect(messageA.contact_id).toBe(messageB.contact_id);
    expect(messageA.opportunity_id).toBe(messageB.opportunity_id);
    expect(messageA.conversation_id).toBe(messageB.conversation_id);
    expect(messageA.message_id).not.toBe(messageB.message_id);
  });

  it("deduplica mensagem externa mesmo quando o provedor repete em outro evento", async () => {
    const externalMessageId = crypto.randomUUID();
    const firstEvent = await ingest("account-a");
    const secondEvent = await ingest("account-a");
    const first = await processMessage(firstEvent.event_id, { externalMessageId, phone: "+5511988880003" });
    const second = await processMessage(secondEvent.event_id, { externalMessageId, phone: "+5511988889999" });
    expect(second).toMatchObject({ duplicate: true, message_id: first.message_id });
    const count = await pool.query<{ count: string }>(
      "select count(*)::text count from public.messages where whatsapp_account_id = $1 and external_message_id = $2",
      [accountA, externalMessageId],
    );
    expect(count.rows[0]?.count).toBe("1");
    const replayContact = await pool.query<{ count: string }>(
      "select count(*)::text count from public.person_contacts where clinic_id = $1 and normalized_value = $2",
      [clinicA, "+5511988889999"],
    );
    expect(replayContact.rows[0]?.count).toBe("0");
  });

  it("preserva tipo desconhecido e torna telefone inválido reprocessável", async () => {
    const unknownEvent = await ingest("account-a");
    const unknown = await processMessage(unknownEvent.event_id, {
      messageType: "unknown", phone: "+5511988880004", providerPayloadType: "future_type",
    });
    const stored = await pool.query<{ message_type: string; provider_payload_type: string }>(
      "select message_type, provider_payload_type from public.messages where id = $1",
      [unknown.message_id],
    );
    expect(stored.rows).toEqual([{ message_type: "unknown", provider_payload_type: "future_type" }]);

    const invalidEvent = await ingest("account-a");
    const invalid = await processMessage(invalidEvent.event_id, { phone: "123" });
    expect(invalid.error_code).toBe("processing_failed");
    const failed = await pool.query<{ last_error_code: string; processing_status: string }>(
      "select processing_status, last_error_code from public.whatsapp_webhook_events where id = $1",
      [invalidEvent.event_id],
    );
    expect(failed.rows).toEqual([{ last_error_code: "processing_failed", processing_status: "failed" }]);
    const retried = await asServiceRole<{ retry_whatsapp_event: boolean }>(
      "select public.retry_whatsapp_event($1)", [invalidEvent.event_id],
    );
    expect(retried[0]?.retry_whatsapp_event).toBe(true);
  });

  it("atribui, marca lida, fecha e reabre com histórico", async () => {
    const event = await ingest("account-a");
    const message = await processMessage(event.event_id, { phone: "+5511988880005" });
    const assigned = await managerA.client.rpc("assign_conversation", {
      p_clinic_id: clinicA, p_conversation_id: message.conversation_id!, p_to_user_id: sdrA.id,
    });
    expect(assigned.error).toBeNull();
    const read = await sdrA.client.rpc("mark_conversation_read", {
      p_clinic_id: clinicA, p_conversation_id: message.conversation_id!,
    });
    expect(read.error).toBeNull();
    const closed = await managerA.client.rpc("set_conversation_state", {
      p_clinic_id: clinicA, p_conversation_id: message.conversation_id!, p_state: "closed",
    });
    const reopened = await managerA.client.rpc("set_conversation_state", {
      p_clinic_id: clinicA, p_conversation_id: message.conversation_id!, p_state: "open",
    });
    expect(closed.error).toBeNull();
    expect(reopened.error).toBeNull();
    const state = await pool.query<{ assignments: string; state: string; unread_count: number }>(
      `select c.state, c.unread_count,
        (select count(*) from public.conversation_assignments ca where ca.conversation_id = c.id)::text assignments
       from public.conversations c where c.id = $1`, [message.conversation_id],
    );
    expect(state.rows).toEqual([{ assignments: "1", state: "open", unread_count: 0 }]);
  });

  it("persiste outbound idempotente e tentativa sem SDK externo", async () => {
    const event = await ingest("account-a");
    const inbound = await processMessage(event.event_id, { phone: "+5511988880006" });
    await managerA.client.rpc("assign_conversation", {
      p_clinic_id: clinicA, p_conversation_id: inbound.conversation_id!, p_to_user_id: sdrA.id,
    });
    const key = crypto.randomUUID();
    const first = await sdrA.client.rpc("create_whatsapp_outbound_message", {
      p_attachment_metadata: {}, p_clinic_id: clinicA,
      p_conversation_id: inbound.conversation_id!, p_idempotency_key: key,
      p_message_type: "text", p_text_content: "Resposta fictícia",
    });
    const replay = await sdrA.client.rpc("create_whatsapp_outbound_message", {
      p_attachment_metadata: {}, p_clinic_id: clinicA,
      p_conversation_id: inbound.conversation_id!, p_idempotency_key: key,
      p_message_type: "text", p_text_content: "Ignorada",
    });
    expect(first.error).toBeNull();
    expect(replay.data).toEqual(first.data);
    const row = await pool.query<{ attempts: string; direction: string }>(
      `select m.direction,
        (select count(*) from public.message_delivery_attempts a where a.message_id = m.id)::text attempts
       from public.messages m where m.id = $1`, [first.data?.[0]?.message_id],
    );
    expect(row.rows).toEqual([{ attempts: "1", direction: "outbound" }]);
  });

  it("aplica status idempotente sem regressão de read para delivered", async () => {
    const messageEvent = await ingest("account-a");
    const externalMessageId = crypto.randomUUID();
    const message = await processMessage(messageEvent.event_id, {
      direction: "outbound", externalMessageId, phone: "+5511988880007",
    });
    const statuses = ["sent", "delivered", "read", "delivered"];
    const applications: boolean[] = [];
    for (const status of statuses) {
      const statusEvent = await ingest("account-a", crypto.randomUUID(), "message.status");
      const rows = await asServiceRole<{ applied: boolean; current_status: string }>(
        "select * from public.record_whatsapp_message_status($1, $2, $3, $4)",
        [statusEvent.event_id, externalMessageId, status, new Date().toISOString()],
      );
      applications.push(rows[0]!.applied);
      expect(rows[0]!.current_status).toBe(status === "delivered" && applications.length === 4 ? "read" : status);
    }
    expect(applications).toEqual([true, true, true, false]);
    const history = await pool.query<{ applied: boolean; status: string }>(
      "select status, applied from public.message_status_events where message_id = $1 order by occurred_at, created_at, id",
      [message.message_id],
    );
    expect(history.rows.some((row) => row.status === "delivered" && !row.applied)).toBe(true);
  });

  it("aplica RLS, paginação, busca e ausência de payload técnico", async () => {
    const eventA = await ingest("account-a");
    const conversationA = await processMessage(eventA.event_id, { phone: "+5511988880008" });
    const eventB = await ingest("account-b");
    await processMessage(eventB.event_id, { phone: "+5511977770008" });
    const assigned = await managerA.client.rpc("assign_conversation", {
      p_clinic_id: clinicA, p_conversation_id: conversationA.conversation_id!, p_to_user_id: sdrA.id,
    });
    expect(assigned.error).toBeNull();
    const list = await sdrA.client.rpc("search_conversations", {
      p_assigned_to_user_id: sdrA.id, p_clinic_id: clinicA, p_page: 1,
      p_page_size: 1, p_search: "+5511988880008", p_state: "open", p_unread_only: true,
    });
    expect(list.error).toBeNull();
    expect(list.data).toHaveLength(1);
    expect(list.data?.[0]?.id).toBe(conversationA.conversation_id);
    const crossTenant = await sdrA.client.from("conversations").select("id").eq("clinic_id", clinicB);
    const rawPayload = await sdrA.client.from("whatsapp_webhook_events").select("raw_payload");
    expect(crossTenant.data).toEqual([]);
    expect(rawPayload.error).not.toBeNull();
  });

  it("bloqueia referências cross-tenant e mantém todas as entidades tenant-owned", async () => {
    const event = await ingest("account-a");
    const message = await processMessage(event.event_id, { phone: "+5511988880009" });
    await expect(pool.query(
      `update public.conversations set whatsapp_account_id = $1 where id = $2`,
      [accountB, message.conversation_id],
    )).rejects.toThrow(/foreign key/);
    const catalog = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.columns
       where table_schema = 'public' and column_name = 'clinic_id'
         and table_name = any($1::text[]) order by table_name`,
      [["whatsapp_accounts", "whatsapp_webhook_events", "conversations", "messages",
        "message_status_events", "conversation_assignments", "message_delivery_attempts"]],
    );
    expect(catalog.rows).toHaveLength(7);
  });
});
