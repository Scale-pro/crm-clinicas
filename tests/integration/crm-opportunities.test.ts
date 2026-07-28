import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestAdminClient, createTestUserClient } from "./helpers/create-test-admin-client";
import { createTestDbPool } from "./helpers/create-test-db-client";
import { currentTotp } from "./helpers/totp";

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
let sdrB: FixtureUser;
let professionalA: FixtureUser;
let viewerA: FixtureUser;
let platformAdmin: FixtureUser;
let clinicA: string;
let clinicB: string;
let contactA: string;
let contactB: string;

async function createUser(label: string, aal2 = false) {
  const email = `${label}-${crypto.randomUUID()}@example.test`;
  const created = await admin.auth.admin.createUser({ email, email_confirm: true, password });
  if (created.error || !created.data.user) throw created.error;
  userIds.push(created.data.user.id);
  const client = createTestUserClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  if (aal2) {
    const enrolled = await client.auth.mfa.enroll({ factorType: "totp" });
    if (enrolled.error || !enrolled.data || !("totp" in enrolled.data)) throw enrolled.error;
    const verified = await client.auth.mfa.challengeAndVerify({
      factorId: enrolled.data.id,
      code: currentTotp(enrolled.data.totp.secret),
    });
    if (verified.error) throw verified.error;
  }
  return { client, id: created.data.user.id };
}

async function createContact(actor: FixtureUser, clinicId: string, name: string) {
  const result = await actor.client.rpc("create_contact", {
    clinic_id: clinicId, full_name: name, idempotency_key: crypto.randomUUID(),
    link_as_patient: false, methods: [], notes: null,
  });
  if (result.error || typeof result.data !== "string") throw result.error;
  return result.data;
}

async function createOpportunity(
  actor: FixtureUser,
  clinicId: string,
  contactId: string,
  options: { confirmed?: boolean; key?: string; title?: string } = {},
) {
  return actor.client.rpc("create_opportunity", {
    amount_cents: 150000,
    clinic_id: clinicId,
    confirmed_existing_open: options.confirmed ?? false,
    contact_id: contactId,
    idempotency_key: options.key ?? crypto.randomUUID(),
    initial_source_id: null,
    title: options.title ?? "Procedimento fictício",
  });
}

beforeAll(async () => {
  [ownerA, ownerB, managerA, sdrA, sdrB, professionalA, viewerA, platformAdmin] = await Promise.all([
    createUser("opp-owner-a", true), createUser("opp-owner-b"), createUser("opp-manager"),
    createUser("opp-sdr-a"), createUser("opp-sdr-b"), createUser("opp-professional"), createUser("opp-viewer"),
    createUser("opp-platform"),
  ]);
  const clinics = await pool.query<{ id: string; name: string }>(
    `insert into public.clinics (name, slug, timezone, created_by)
     values ('Clínica Pipeline Fictícia A', $1, 'America/Sao_Paulo', $3),
            ('Clínica Pipeline Fictícia B', $2, 'America/Sao_Paulo', $4)
     returning id, name`,
    [`opp-a-${crypto.randomUUID()}`, `opp-b-${crypto.randomUUID()}`, ownerA.id, ownerB.id],
  );
  clinicA = clinics.rows.find((row) => row.name.endsWith("A"))!.id;
  clinicB = clinics.rows.find((row) => row.name.endsWith("B"))!.id;
  clinicIds.push(clinicA, clinicB);
  await pool.query(
     `insert into public.clinic_members (clinic_id, user_id, role) values
       ($1, $3, 'owner'), ($2, $4, 'owner'), ($1, $5, 'manager'),
       ($1, $6, 'sdr'), ($1, $7, 'sdr'), ($1, $8, 'professional'), ($1, $9, 'viewer')`,
    [clinicA, clinicB, ownerA.id, ownerB.id, managerA.id, sdrA.id, sdrB.id, professionalA.id, viewerA.id],
  );
  await pool.query("insert into public.platform_admins (user_id, created_by) values ($1, $1)", [platformAdmin.id]);
  contactA = await createContact(sdrA, clinicA, "Contato Pipeline A");
  contactB = await createContact(ownerB, clinicB, "Contato Pipeline B");
});

afterAll(async () => {
  if (clinicIds.length) {
    await pool.query("delete from public.opportunity_stage_events where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.audit_logs where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.activities where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.opportunities where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.pipeline_stages where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.pipelines where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.person_contacts where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.contacts where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.lead_sources where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.clinics where id = any($1::uuid[])", [clinicIds]);
  }
  await pool.query("delete from public.platform_admins where user_id = $1", [platformAdmin?.id]);
  for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  await pool.end();
});

describe("CRM F2.2 oportunidades e pipeline", () => {
  it("cria pipeline padrão e cinco etapas para clínica criada após a migration", async () => {
    const { rows } = await pool.query<{ defaults: string; lost: string; stages: string; won: string }>(
      `select count(distinct p.id) filter (where p.is_default and p.archived_at is null)::text as defaults,
              count(ps.id)::text as stages,
              count(ps.id) filter (where ps.stage_kind = 'won')::text as won,
              count(ps.id) filter (where ps.stage_kind = 'lost')::text as lost
       from public.pipelines p join public.pipeline_stages ps on ps.pipeline_id = p.id
       where p.clinic_id = $1`, [clinicA],
    );
    expect(rows).toEqual([{ defaults: "1", lost: "1", stages: "5", won: "1" }]);
  });

  it("semeia a matriz fechada e reserva permissões AAL2 a owner/admin", async () => {
    const { rows } = await pool.query<{ permission: string; role: string }>(
      `select role, permission from public.role_permissions
       where permission like 'opportunity.%' or permission = 'pipeline.manage'
       order by role, permission`,
    );
    const byRole = Map.groupBy(rows, (row) => row.role);
    expect(byRole.get("owner")).toHaveLength(10);
    expect(byRole.get("admin")).toHaveLength(10);
    expect(byRole.get("manager")).toHaveLength(8);
    expect(byRole.get("sdr")).toHaveLength(5);
    expect(byRole.get("receptionist")).toHaveLength(2);
    expect(byRole.get("professional")).toHaveLength(1);
    expect(byRole.get("viewer")).toHaveLength(1);
    expect(rows.filter((row) => ["opportunity.reopen", "pipeline.manage"].includes(row.permission))
      .map((row) => row.role).sort()).toEqual(["admin", "admin", "owner", "owner"]);
  });

  it("exige confirmação para múltiplas abertas e preserva idempotência", async () => {
    const key = crypto.randomUUID();
    const first = await createOpportunity(sdrA, clinicA, contactA, { key });
    const replay = await createOpportunity(sdrA, clinicA, contactA, { key, title: "Ignorada" });
    const warning = await createOpportunity(sdrA, clinicA, contactA);
    const confirmed = await createOpportunity(sdrA, clinicA, contactA, { confirmed: true });
    expect(first.error).toBeNull();
    expect(replay.error).toBeNull();
    expect(first.data?.[0]?.opportunity_id).toBe(replay.data?.[0]?.opportunity_id);
    expect(warning.data?.[0]).toMatchObject({ has_existing_open: true, opportunity_id: null });
    expect(confirmed.data?.[0]?.opportunity_id).toBeTruthy();
    const counts = await pool.query<{ activities: string; audits: string; events: string }>(
      `select
        (select count(*) from public.activities where opportunity_id = $1)::text as activities,
        (select count(*) from public.audit_logs where entity_id = $1 and action = 'opportunity.created')::text as audits,
        (select count(*) from public.opportunity_stage_events where opportunity_id = $1)::text as events`,
      [first.data?.[0]?.opportunity_id],
    );
    expect(counts.rows).toEqual([{ activities: "1", audits: "1", events: "1" }]);
  });

  it("aplica own/all, isolamento, platform admin e referência cross-tenant", async () => {
    const ownCreated = await createOpportunity(sdrA, clinicA, contactA, { confirmed: true });
    const otherCreated = await createOpportunity(ownerB, clinicB, contactB);
    const ownId = ownCreated.data?.[0]?.opportunity_id;
    const otherId = otherCreated.data?.[0]?.opportunity_id;
    const [sdrRows, managerRows, viewerRows, platformRows, crossTenantCreate] = await Promise.all([
      sdrA.client.from("opportunities").select("id").eq("clinic_id", clinicA),
      managerA.client.from("opportunities").select("id").eq("clinic_id", clinicA),
      viewerA.client.from("opportunities").select("id").eq("clinic_id", clinicA),
      platformAdmin.client.from("opportunities").select("id"),
      createOpportunity(sdrA, clinicA, contactB),
    ]);
    expect(sdrRows.data?.some((row) => row.id === ownId)).toBe(true);
    expect(sdrRows.data?.some((row) => row.id === otherId)).toBe(false);
    expect(managerRows.data!.length).toBeGreaterThanOrEqual(sdrRows.data!.length);
    expect(viewerRows.data!.length).toBe(managerRows.data!.length);
    expect(platformRows.data).toEqual([]);
    expect(crossTenantCreate.error).not.toBeNull();
  });

  it("busca no banco antes do limite e pagina mais de 300 oportunidades sem duplicar", async () => {
    const token = crypto.randomUUID();
    const oldContact = await createContact(managerA, clinicA, `Contato antigo ${token}`);
    const recentContact = await createContact(managerA, clinicA, `Contato recente ${token}`);
    const source = await pool.query<{ id: string }>(
      "insert into public.lead_sources (clinic_id, name) values ($1, $2) returning id",
      [clinicA, `Origem volume ${token}`],
    );
    const board = await pool.query<{ pipeline_id: string; stage_id: string }>(
      `select p.id as pipeline_id, ps.id as stage_id
       from public.pipelines p
       join public.pipeline_stages ps on ps.pipeline_id = p.id
       where p.clinic_id = $1 and p.is_default and ps.stage_kind = 'open'
       order by ps.position, ps.id limit 1`,
      [clinicA],
    );
    const pipelineId = board.rows[0]!.pipeline_id;
    const stageId = board.rows[0]!.stage_id;
    const commonTitle = `Volume ${token}`;
    const oldTitle = `${commonTitle} antiga 100% _ \\, "aspas" (parênteses)`;
    const oldOpportunity = await pool.query<{ id: string }>(
      `insert into public.opportunities (
         clinic_id, contact_id, pipeline_id, stage_id, status,
         assigned_to_user_id, initial_source_id, title, board_position
       ) values ($1, $2, $3, $4, 'open', $5, $6, $7, 1000000)
       returning id`,
      [clinicA, oldContact, pipelineId, stageId, managerA.id, source.rows[0]!.id, oldTitle],
    );
    await pool.query(
      `insert into public.opportunities (
         clinic_id, contact_id, pipeline_id, stage_id, status,
         assigned_to_user_id, title, board_position
       )
       select $1, $2, $3, $4, 'open', $5,
              $6 || ' ' || lpad(series::text, 3, '0'), series
       from generate_series(1, 305) as series`,
      [clinicA, recentContact, pipelineId, stageId, sdrA.id, commonTitle],
    );
    await pool.query(
      `insert into public.opportunities (
         clinic_id, contact_id, pipeline_id, stage_id, status,
         assigned_to_user_id, title, board_position
       )
       select $1, $2, p.id, ps.id, 'open', $3, $4, 1
       from public.pipelines p
       join public.pipeline_stages ps on ps.pipeline_id = p.id
       where p.clinic_id = $1 and p.is_default and ps.stage_kind = 'open'
       order by ps.position, ps.id limit 1`,
      [clinicB, contactB, ownerB.id, commonTitle],
    );

    const search = async (overrides: Partial<{
      assigned: string | null;
      page: number;
      pageSize: number;
      source: string | null;
      term: string;
    }> = {}) => managerA.client.rpc("search_opportunity_board", {
      p_assigned_to_user_id: overrides.assigned ?? null,
      p_clinic_id: clinicA,
      p_initial_source_id: overrides.source ?? null,
      p_page: overrides.page ?? 1,
      p_page_size: overrides.pageSize ?? 40,
      p_pipeline_id: pipelineId,
      p_search_term: overrides.term ?? commonTitle,
      p_status: "open",
    });

    const [byTitle, byContact, byAssignee, bySource] = await Promise.all([
      search({ term: `100% _ \\, "aspas" (parênteses)` }),
      search({ term: `CONTATO ANTIGO ${token.toUpperCase()}` }),
      search({ assigned: managerA.id }),
      search({ source: source.rows[0]!.id }),
    ]);
    for (const result of [byTitle, byContact, byAssignee, bySource]) {
      expect(result.error).toBeNull();
      expect(result.data?.map((row: { id: string }) => row.id)).toEqual([oldOpportunity.rows[0]!.id]);
    }

    const pages = await Promise.all([1, 2, 3, 4].map((page) => search({ page, pageSize: 100 })));
    expect(pages.every((result) => result.error === null)).toBe(true);
    expect(pages.slice(0, 3).every((result) => result.data?.length === 101)).toBe(true);
    expect(pages[3]!.data).toHaveLength(6);
    const displayedIds = pages.flatMap((result) =>
      (result.data ?? []).slice(0, 100).map((row: { id: string }) => row.id));
    expect(displayedIds).toHaveLength(306);
    expect(new Set(displayedIds).size).toBe(306);
    expect(displayedIds).toContain(oldOpportunity.rows[0]!.id);
    const repeated = await search({ page: 1, pageSize: 100 });
    expect(repeated.data?.map((row: { id: string }) => row.id)).toEqual(
      pages[0]!.data?.map((row: { id: string }) => row.id),
    );
  });

  it("localiza e seleciona contato antigo após mais de 120 contatos recentes", async () => {
    const token = crypto.randomUUID();
    const oldContact = await createContact(managerA, clinicA, `Seleção antiga ${token}`);
    await pool.query(
      `insert into public.contacts (
         clinic_id, owner_user_id, full_name, created_by, updated_by
       )
       select $1, $2, $3 || ' ' || lpad(series::text, 3, '0'), $2, $2
       from generate_series(1, 121) as series`,
      [clinicA, managerA.id, `Seleção recente ${token}`],
    );
    await pool.query(
      `insert into public.contacts (
         clinic_id, owner_user_id, full_name, created_by, updated_by
       ) values ($1, $2, $3, $2, $2)`,
      [clinicB, ownerB.id, `Seleção antiga ${token}`],
    );
    const found = await managerA.client.rpc("search_contacts", {
      p_clinic_id: clinicA,
      p_include_archived: false,
      p_limit: 20,
      p_normalized_value: null,
      p_owner_user_id: null,
      p_search_term: `seleção ANTIGA ${token}`,
    });
    expect(found.error).toBeNull();
    expect(found.data?.map((contact: { id: string }) => contact.id)).toEqual([oldContact]);
    const selected = await createOpportunity(managerA, clinicA, found.data![0]!.id, {
      title: `Oportunidade do contato antigo ${token}`,
    });
    expect(selected.error).toBeNull();
    expect(selected.data?.[0]?.opportunity_id).toBeTruthy();
  });

  it("deixa órfã fora de own, dentro de all e preserva ao remover membro", async () => {
    const created = await createOpportunity(sdrA, clinicA, contactA, { confirmed: true });
    const id = created.data?.[0]?.opportunity_id;
    await pool.query("delete from public.clinic_members where clinic_id = $1 and user_id = $2", [clinicA, sdrA.id]);
    const persisted = await pool.query<{ assigned_to_user_id: string | null }>(
      "select assigned_to_user_id from public.opportunities where id = $1", [id],
    );
    const managerVisible = await managerA.client.from("opportunities").select("id").eq("id", id!);
    const sdrVisible = await sdrA.client.from("opportunities").select("id").eq("id", id!);
    expect(persisted.rows).toEqual([{ assigned_to_user_id: null }]);
    expect(managerVisible.data).toEqual([{ id }]);
    expect(sdrVisible.data).toEqual([]);
    await pool.query("insert into public.clinic_members (clinic_id, user_id, role) values ($1, $2, 'sdr')", [clinicA, sdrA.id]);
  });

  it("resolve update e movimento concorrentes por expected_version", async () => {
    const created = await createOpportunity(sdrA, clinicA, contactA, { confirmed: true });
    const id = created.data?.[0]?.opportunity_id;
    if (!id) throw new Error("Oportunidade fictícia não criada.");
    const initial = await pool.query<{ stage_id: string; version: number }>(
      "select stage_id, version from public.opportunities where id = $1", [id],
    );
    const stages = await pool.query<{ id: string }>(
      `select ps.id from public.pipeline_stages ps join public.opportunities o on o.pipeline_id = ps.pipeline_id
       where o.id = $1 and ps.stage_kind = 'open' and ps.id <> o.stage_id order by ps.position`, [id],
    );
    const updates = await Promise.all([
      sdrA.client.rpc("update_opportunity", { clinic_id: clinicA, opportunity_id: id, title: "Versão A", amount_cents: 1, initial_source_id: null, expected_version: initial.rows[0]!.version }),
      sdrA.client.rpc("update_opportunity", { clinic_id: clinicA, opportunity_id: id, title: "Versão B", amount_cents: 2, initial_source_id: null, expected_version: initial.rows[0]!.version }),
    ]);
    expect(updates.filter((result) => result.error === null)).toHaveLength(1);
    expect(updates.filter((result) => result.error?.code === "P4091")).toHaveLength(1);
    const current = await pool.query<{ version: number }>("select version from public.opportunities where id = $1", [id]);
    const moves = await Promise.all([
      sdrA.client.rpc("move_opportunity", { clinic_id: clinicA, opportunity_id: id, target_stage_id: stages.rows[0]!.id, expected_version: current.rows[0]!.version, before_opportunity_id: null, after_opportunity_id: null }),
      sdrA.client.rpc("move_opportunity", { clinic_id: clinicA, opportunity_id: id, target_stage_id: stages.rows[1]!.id, expected_version: current.rows[0]!.version, before_opportunity_id: null, after_opportunity_id: null }),
    ]);
    expect(moves.filter((result) => result.error === null)).toHaveLength(1);
    expect(moves.filter((result) => result.error?.code === "P4091")).toHaveLength(1);
  });

  it("fecha uma vez, reabre em AAL2 e mantém ambos os eventos", async () => {
    const created = await createOpportunity(ownerA, clinicA, contactA, { confirmed: true });
    const id = created.data?.[0]?.opportunity_id;
    if (!id) throw new Error("Oportunidade fictícia não criada.");
    const row = await pool.query<{ stage_id: string; version: number }>(
      "select stage_id, version from public.opportunities where id = $1", [id],
    );
    const close = await ownerA.client.rpc("close_opportunity", {
      clinic_id: clinicA, opportunity_id: id, target_status: "lost",
      close_reason: "Correção de teste", expected_version: row.rows[0]!.version,
    });
    expect(close.error).toBeNull();
    const closed = await pool.query<{ version: number }>("select version from public.opportunities where id = $1", [id]);
    const reopen = await ownerA.client.rpc("reopen_opportunity", {
      clinic_id: clinicA, opportunity_id: id, target_stage_id: row.rows[0]!.stage_id,
      reason: "Fechado por engano", expected_version: closed.rows[0]!.version,
    });
    expect(reopen.error).toBeNull();
    const events = await pool.query<{ to_status: string }>(
      "select to_status from public.opportunity_stage_events where opportunity_id = $1 order by occurred_at, id", [id],
    );
    expect(events.rows.map((event) => event.to_status)).toEqual(["open", "lost", "open"]);
  });

  it("nega reabertura sem AAL2, fora de 24h e escrita direta no histórico", async () => {
    const created = await createOpportunity(managerA, clinicA, contactA, { confirmed: true });
    const id = created.data?.[0]?.opportunity_id;
    if (!id) throw new Error("Oportunidade fictícia não criada.");
    const initial = await pool.query<{ stage_id: string; version: number }>(
      "select stage_id, version from public.opportunities where id = $1", [id],
    );
    const close = await managerA.client.rpc("close_opportunity", {
      clinic_id: clinicA, opportunity_id: id, target_status: "won", close_reason: null,
      expected_version: initial.rows[0]!.version,
    });
    expect(close.error).toBeNull();
    const denied = await managerA.client.rpc("reopen_opportunity", {
      clinic_id: clinicA, opportunity_id: id, target_stage_id: initial.rows[0]!.stage_id,
      reason: "Sem permissão", expected_version: close.data,
    });
    expect(denied.error).not.toBeNull();
    await pool.query("update public.opportunities set closed_at = statement_timestamp() - interval '25 hours' where id = $1", [id]);
    const expired = await ownerA.client.rpc("reopen_opportunity", {
      clinic_id: clinicA, opportunity_id: id, target_stage_id: initial.rows[0]!.stage_id,
      reason: "Fora da janela", expected_version: close.data,
    });
    expect(expired.error).not.toBeNull();
    const event = await pool.query<{ id: string }>(
      "select id from public.opportunity_stage_events where opportunity_id = $1 limit 1", [id],
    );
    const directUpdate = await viewerA.client.from("opportunity_stage_events")
      .update({ reason: "proibido" }).eq("id", event.rows[0]!.id);
    const directDelete = await viewerA.client.from("opportunity_stage_events")
      .delete().eq("id", event.rows[0]!.id);
    expect(directUpdate.error).not.toBeNull();
    expect(directDelete.error).not.toBeNull();
  });

  it("expõe contato somente por oportunidade visível e revoga leitura após reatribuição", async () => {
    const token = crypto.randomUUID();
    const createdContact = await managerA.client.rpc("create_contact", {
      clinic_id: clinicA,
      full_name: `Contato atribuído ${token}`,
      idempotency_key: crypto.randomUUID(),
      link_as_patient: false,
      methods: [
        {
          is_primary: true, is_whatsapp: false, kind: "phone", label: "Principal",
          normalized_value: `+5511${token.replace(/\D/g, "").padEnd(9, "0").slice(0, 9)}`,
          raw_value: "+55 11 90000-0000",
        },
        {
          is_primary: true, is_whatsapp: false, kind: "email", label: "Principal",
          normalized_value: `${token}@example.test`, raw_value: `${token}@example.test`,
        },
      ],
      notes: null,
    });
    expect(createdContact.error).toBeNull();
    const contactId = createdContact.data!;
    const createdOpportunity = await createOpportunity(managerA, clinicA, contactId, {
      title: `Oportunidade atribuída ${token}`,
    });
    const opportunityId = createdOpportunity.data?.[0]?.opportunity_id;
    if (!opportunityId) throw new Error("Oportunidade para visibilidade não criada.");
    const initial = await pool.query<{ version: number }>(
      "select version from public.opportunities where id = $1",
      [opportunityId],
    );
    const assignedToFirst = await managerA.client.rpc("assign_opportunity", {
      assigned_to_user_id: sdrA.id,
      clinic_id: clinicA,
      expected_version: initial.rows[0]!.version,
      opportunity_id: opportunityId,
    });
    expect(assignedToFirst.error).toBeNull();

    const [opportunityRead, contactRead, methodsRead, activityRead, viewerRead, crossTenantRead, platformRead] = await Promise.all([
      sdrA.client.from("opportunities").select("id").eq("id", opportunityId),
      sdrA.client.from("contacts").select("id,full_name").eq("id", contactId),
      sdrA.client.from("person_contacts").select("id,kind,raw_value").eq("contact_id", contactId).order("kind"),
      sdrA.client.from("activities").select("id").eq("opportunity_id", opportunityId).eq("contact_id", contactId),
      viewerA.client.from("contacts").select("id").eq("id", contactId),
      ownerB.client.from("contacts").select("id").eq("id", contactId),
      platformAdmin.client.from("contacts").select("id").eq("id", contactId),
    ]);
    expect(opportunityRead.data).toEqual([{ id: opportunityId }]);
    expect(contactRead.data).toEqual([{ id: contactId, full_name: `Contato atribuído ${token}` }]);
    expect(methodsRead.data).toHaveLength(2);
    expect(methodsRead.data?.map((method) => method.kind).sort()).toEqual(["email", "phone"]);
    expect(methodsRead.data?.every((method) => Boolean(method.raw_value))).toBe(true);
    expect(activityRead.data?.length).toBeGreaterThan(0);
    expect(viewerRead.data).toEqual([{ id: contactId }]);
    expect(crossTenantRead.data).toEqual([]);
    expect(platformRead.data).toEqual([]);

    const selectedMethod = methodsRead.data![0]!;
    const [editContact, editMethod] = await Promise.all([
      sdrA.client.rpc("update_contact", {
        clinic_id: clinicA, contact_id: contactId, expected_version: 1,
        full_name: "Alteração proibida", notes: null,
      }),
      sdrA.client.rpc("update_contact_method", {
        clinic_id: clinicA, contact_method_id: selectedMethod.id, is_whatsapp: false,
        kind: selectedMethod.kind, label: "Proibido",
        normalized_value: selectedMethod.kind === "phone"
          ? "+5511999999999"
          : "proibido@example.test",
        raw_value: selectedMethod.kind === "phone" ? "+55 11 99999-9999" : "proibido@example.test",
      }),
    ]);
    expect(editContact.error).not.toBeNull();
    expect(editMethod.error).not.toBeNull();

    const assignedToSecond = await managerA.client.rpc("assign_opportunity", {
      assigned_to_user_id: sdrB.id,
      clinic_id: clinicA,
      expected_version: assignedToFirst.data!,
      opportunity_id: opportunityId,
    });
    expect(assignedToSecond.error).toBeNull();
    const [firstAfter, secondAfter, secondMethods, secondActivity] = await Promise.all([
      sdrA.client.from("contacts").select("id").eq("id", contactId),
      sdrB.client.from("contacts").select("id").eq("id", contactId),
      sdrB.client.from("person_contacts").select("id").eq("contact_id", contactId),
      sdrB.client.from("activities").select("id").eq("opportunity_id", opportunityId),
    ]);
    expect(firstAfter.data).toEqual([]);
    expect(secondAfter.data).toEqual([{ id: contactId }]);
    expect(secondMethods.data).toHaveLength(2);
    expect(secondActivity.data?.length).toBeGreaterThan(0);

    await pool.query(
      "delete from public.clinic_members where clinic_id = $1 and user_id = $2",
      [clinicA, sdrB.id],
    );
    const orphaned = await sdrB.client.from("contacts").select("id").eq("id", contactId);
    expect(orphaned.data).toEqual([]);
    await pool.query(
      "insert into public.clinic_members (clinic_id, user_id, role) values ($1, $2, 'sdr')",
      [clinicA, sdrB.id],
    );
  });
});
