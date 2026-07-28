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
type OpportunitySearchRow = {
  assigned_to_user_id: string | null;
  id: string;
  pipeline_id: string;
  pipeline_name: string;
};
let ownerA: FixtureUser;
let ownerB: FixtureUser;
let adminA: FixtureUser;
let managerA: FixtureUser;
let sdrA: FixtureUser;
let platformAdmin: FixtureUser;
let clinicA: string;
let clinicB: string;
let clinicLast: string;
let contactA: string;
let defaultPipelineA: string;
let secondPipelineA: string;
let duplicatedPipelineA: string;

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
    clinic_id: clinicId,
    full_name: name,
    idempotency_key: crypto.randomUUID(),
    link_as_patient: false,
    methods: [],
    notes: null,
  });
  if (result.error || typeof result.data !== "string") throw result.error;
  return result.data;
}

function createPipeline(
  actor: FixtureUser,
  clinicId: string,
  name: string,
  idempotencyKey = crypto.randomUUID(),
) {
  return actor.client.rpc("create_pipeline", {
    clinic_id: clinicId,
    idempotency_key: idempotencyKey,
    name,
  });
}

function duplicatePipeline(
  actor: FixtureUser,
  clinicId: string,
  sourcePipelineId: string,
  name: string,
  idempotencyKey = crypto.randomUUID(),
) {
  return actor.client.rpc("duplicate_pipeline", {
    clinic_id: clinicId,
    idempotency_key: idempotencyKey,
    name,
    source_pipeline_id: sourcePipelineId,
  });
}

function createOpportunity(
  actor: FixtureUser,
  clinicId: string,
  contactId: string,
  options: { confirmed?: boolean; pipelineId?: string | null; title?: string } = {},
) {
  return actor.client.rpc("create_opportunity", {
    amount_cents: 10000,
    clinic_id: clinicId,
    confirmed_existing_open: options.confirmed ?? false,
    contact_id: contactId,
    idempotency_key: crypto.randomUUID(),
    initial_source_id: null,
    pipeline_id: options.pipelineId ?? null,
    title: options.title ?? "Oportunidade multi-pipeline fictícia",
  });
}

beforeAll(async () => {
  [ownerA, ownerB, adminA, managerA, sdrA, platformAdmin] = await Promise.all([
    createUser("multi-owner-a", true),
    createUser("multi-owner-b", true),
    createUser("multi-admin-a"),
    createUser("multi-manager-a", true),
    createUser("multi-sdr-a"),
    createUser("multi-platform"),
  ]);
  const clinics = await pool.query<{ id: string; name: string }>(
    `insert into public.clinics (name, slug, timezone, created_by)
     values ('Clínica Multi Pipeline A', $1, 'America/Sao_Paulo', $4),
            ('Clínica Multi Pipeline B', $2, 'America/Sao_Paulo', $5),
            ('Clínica Última Pipeline', $3, 'America/Sao_Paulo', $4)
     returning id, name`,
    [
      `multi-a-${crypto.randomUUID()}`,
      `multi-b-${crypto.randomUUID()}`,
      `multi-last-${crypto.randomUUID()}`,
      ownerA.id,
      ownerB.id,
    ],
  );
  clinicA = clinics.rows.find((row) => row.name.endsWith("A"))!.id;
  clinicB = clinics.rows.find((row) => row.name.endsWith("B"))!.id;
  clinicLast = clinics.rows.find((row) => row.name.includes("Última"))!.id;
  clinicIds.push(clinicA, clinicB, clinicLast);
  await pool.query(
    `insert into public.clinic_members (clinic_id, user_id, role) values
       ($1, $4, 'owner'), ($1, $5, 'admin'), ($1, $6, 'manager'),
       ($1, $7, 'sdr'), ($2, $8, 'owner'), ($3, $4, 'owner')`,
    [clinicA, clinicB, clinicLast, ownerA.id, adminA.id, managerA.id, sdrA.id, ownerB.id],
  );
  await pool.query(
    "insert into public.platform_admins (user_id, created_by) values ($1, $1)",
    [platformAdmin.id],
  );
  contactA = await createContact(ownerA, clinicA, "Contato Multi Pipeline A");
  const defaults = await pool.query<{ clinic_id: string; id: string }>(
    `select clinic_id, id from public.pipelines
     where clinic_id = any($1::uuid[]) and is_default and archived_at is null`,
    [clinicIds],
  );
  defaultPipelineA = defaults.rows.find((row) => row.clinic_id === clinicA)!.id;
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
    await pool.query("delete from public.clinics where id = any($1::uuid[])", [clinicIds]);
  }
  await pool.query("delete from public.platform_admins where user_id = $1", [platformAdmin?.id]);
  for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  await pool.end();
});

describe("CRM F2.2.6 múltiplas pipelines", () => {
  it("preserva e cria exatamente uma pipeline padrão com cinco etapas", async () => {
    const { rows } = await pool.query<{
      active: string;
      clinic_id: string;
      defaults: string;
      stages: string;
    }>(
      `select p.clinic_id,
              count(distinct p.id) filter (where p.archived_at is null)::text as active,
              count(distinct p.id) filter (
                where p.is_default and p.archived_at is null
              )::text as defaults,
              count(ps.id)::text as stages
       from public.pipelines p
       join public.pipeline_stages ps on ps.pipeline_id = p.id
       where p.clinic_id = any($1::uuid[])
       group by p.clinic_id
       order by p.clinic_id`,
      [clinicIds],
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.active === "1" && row.defaults === "1" && row.stages === "5"))
      .toBe(true);
  });

  it("cria segunda pipeline, permite nome repetido e é idempotente sob concorrência", async () => {
    const key = crypto.randomUUID();
    const concurrent = await Promise.all([
      createPipeline(ownerA, clinicA, "Comercial", key),
      createPipeline(ownerA, clinicA, "Nome ignorado no replay", key),
    ]);
    expect(concurrent.every((result) => result.error === null)).toBe(true);
    expect(concurrent[0]!.data).toBe(concurrent[1]!.data);
    secondPipelineA = concurrent[0]!.data as string;

    const sameName = await createPipeline(ownerA, clinicA, "Comercial");
    expect(sameName.error).toBeNull();
    expect(sameName.data).not.toBe(secondPipelineA);

    const structure = await pool.query<{ kind: string; name: string; position: number }>(
      `select name, stage_kind as kind, position
       from public.pipeline_stages where pipeline_id = $1
       order by position, id`,
      [secondPipelineA],
    );
    expect(structure.rows).toEqual([
      { kind: "open", name: "Novo lead", position: 100 },
      { kind: "open", name: "Contato feito", position: 200 },
      { kind: "open", name: "Reunião agendada", position: 300 },
      { kind: "won", name: "Ganho", position: 900 },
      { kind: "lost", name: "Perdido", position: 1000 },
    ]);
  });

  it("duplica somente etapas, sem oportunidades, e preserva replay idempotente", async () => {
    const sourceOpportunity = await createOpportunity(ownerA, clinicA, contactA, {
      pipelineId: secondPipelineA,
      title: "Não deve ser duplicada",
    });
    expect(sourceOpportunity.error).toBeNull();

    const key = crypto.randomUUID();
    const duplicated = await Promise.all([
      duplicatePipeline(ownerA, clinicA, secondPipelineA, "Cópia Comercial", key),
      duplicatePipeline(ownerA, clinicA, secondPipelineA, "Cópia ignorada", key),
    ]);
    expect(duplicated.every((result) => result.error === null)).toBe(true);
    expect(duplicated[0]!.data).toBe(duplicated[1]!.data);
    duplicatedPipelineA = duplicated[0]!.data as string;

    const counts = await pool.query<{ opportunities: string; stages: string }>(
      `select
         (select count(*) from public.pipeline_stages where pipeline_id = $1)::text as stages,
         (select count(*) from public.opportunities where pipeline_id = $1)::text as opportunities`,
      [duplicatedPipelineA],
    );
    expect(counts.rows).toEqual([{ opportunities: "0", stages: "5" }]);

    const source = await pool.query(
      `select name, stage_kind, position from public.pipeline_stages
       where pipeline_id = $1 order by position, id`,
      [secondPipelineA],
    );
    const copy = await pool.query(
      `select name, stage_kind, position from public.pipeline_stages
       where pipeline_id = $1 order by position, id`,
      [duplicatedPipelineA],
    );
    expect(copy.rows).toEqual(source.rows);
  });

  it("bloqueia cross-tenant, ausência de permissão e ausência de AAL2", async () => {
    const [crossClinic, crossSource, noPermission, noAal2] = await Promise.all([
      createPipeline(ownerA, clinicB, "Proibida"),
      duplicatePipeline(ownerA, clinicA, (
        await pool.query<{ id: string }>(
          "select id from public.pipelines where clinic_id = $1 and is_default",
          [clinicB],
        )
      ).rows[0]!.id, "Cross tenant"),
      createPipeline(managerA, clinicA, "Sem permissão"),
      createPipeline(adminA, clinicA, "Sem AAL2"),
    ]);
    expect(crossClinic.error?.code).toBe("42501");
    expect(crossSource.error?.code).toBe("P0002");
    expect(noPermission.error?.code).toBe("42501");
    expect(noAal2.error?.code).toBe("42501");
  });

  it("renomeia, permite nomes iguais e troca o padrão com concorrência segura", async () => {
    const renamed = await ownerA.client.rpc("rename_pipeline", {
      clinic_id: clinicA,
      name: "Comercial",
      pipeline_id: duplicatedPipelineA,
    });
    expect(renamed.error).toBeNull();

    const changes = await Promise.all([
      ownerA.client.rpc("set_default_pipeline", {
        clinic_id: clinicA, pipeline_id: secondPipelineA,
      }),
      ownerA.client.rpc("set_default_pipeline", {
        clinic_id: clinicA, pipeline_id: duplicatedPipelineA,
      }),
    ]);
    expect(changes.every((result) => result.error === null)).toBe(true);
    const defaults = await pool.query<{ count: string }>(
      `select count(*)::text from public.pipelines
       where clinic_id = $1 and is_default and archived_at is null`,
      [clinicA],
    );
    expect(defaults.rows).toEqual([{ count: "1" }]);

    const selected = await ownerA.client.rpc("set_default_pipeline", {
      clinic_id: clinicA, pipeline_id: secondPipelineA,
    });
    expect(selected.error).toBeNull();
  });

  it("cria na pipeline escolhida e mantém fallback para a padrão", async () => {
    const contact = await createContact(ownerA, clinicA, "Contato Seleção de Pipeline");
    const selected = await createOpportunity(ownerA, clinicA, contact, {
      pipelineId: defaultPipelineA,
      title: "Pipeline selecionada",
    });
    const fallback = await createOpportunity(ownerA, clinicA, contact, {
      confirmed: true,
      pipelineId: null,
      title: "Fallback padrão",
    });
    expect(selected.error).toBeNull();
    expect(fallback.error).toBeNull();
    const ids = [selected.data?.[0]?.opportunity_id, fallback.data?.[0]?.opportunity_id];
    const rows = await pool.query<{ id: string; pipeline_id: string }>(
      "select id, pipeline_id from public.opportunities where id = any($1::uuid[])",
      [ids],
    );
    expect(rows.rows.find((row) => row.id === ids[0])?.pipeline_id).toBe(defaultPipelineA);
    expect(rows.rows.find((row) => row.id === ids[1])?.pipeline_id).toBe(secondPipelineA);
  });

  it("busca uma pipeline ou todas com identificação e preserva own/all", async () => {
    const contact = await createContact(sdrA, clinicA, "Contato Escopo Multi Pipeline");
    const own = await createOpportunity(sdrA, clinicA, contact, {
      pipelineId: defaultPipelineA,
      title: "Busca própria multi pipeline",
    });
    expect(own.error).toBeNull();

    const request = {
      p_assigned_to_user_id: null,
      p_clinic_id: clinicA,
      p_initial_source_id: null,
      p_page: 1,
      p_page_size: 100,
      p_search_term: "multi pipeline",
      p_status: null,
    };
    const [specific, allForOwner, allForSdr] = await Promise.all([
      ownerA.client.rpc("search_opportunity_board", {
        ...request, p_pipeline_id: defaultPipelineA,
      }),
      ownerA.client.rpc("search_opportunity_board", {
        ...request, p_pipeline_id: null,
      }),
      sdrA.client.rpc("search_opportunity_board", {
        ...request, p_pipeline_id: null,
      }),
    ]);
    expect(specific.error).toBeNull();
    expect(specific.data?.every((row: OpportunitySearchRow) =>
      row.pipeline_id === defaultPipelineA)).toBe(true);
    expect(allForOwner.error).toBeNull();
    expect(allForOwner.data?.every((row: OpportunitySearchRow) =>
      typeof row.pipeline_id === "string" && typeof row.pipeline_name === "string"))
      .toBe(true);
    expect(allForOwner.data!.length).toBeGreaterThanOrEqual(specific.data!.length);
    expect(allForSdr.data?.map((row: OpportunitySearchRow) => row.id))
      .toContain(own.data?.[0]?.opportunity_id);
    expect(allForSdr.data?.every((row: OpportunitySearchRow) =>
      row.assigned_to_user_id === sdrA.id)).toBe(true);
  });

  it("protege padrão, última ativa e pipeline com oportunidade aberta", async () => {
    const defaultDenied = await ownerA.client.rpc("archive_pipeline", {
      clinic_id: clinicA, pipeline_id: secondPipelineA,
    });
    expect(defaultDenied.error?.code).toBe("P4202");

    const last = await pool.query<{ id: string }>(
      "select id from public.pipelines where clinic_id = $1 and is_default",
      [clinicLast],
    );
    await pool.query("update public.pipelines set is_default = false where id = $1", [last.rows[0]!.id]);
    const lastDenied = await ownerA.client.rpc("archive_pipeline", {
      clinic_id: clinicLast, pipeline_id: last.rows[0]!.id,
    });
    expect(lastDenied.error?.code).toBe("P4203");
    await pool.query("update public.pipelines set is_default = true where id = $1", [last.rows[0]!.id]);

    const open = await createOpportunity(ownerA, clinicA, contactA, {
      pipelineId: duplicatedPipelineA,
      title: "Bloqueia arquivamento",
    });
    expect(open.error).toBeNull();
    const openDenied = await ownerA.client.rpc("archive_pipeline", {
      clinic_id: clinicA, pipeline_id: duplicatedPipelineA,
    });
    expect(openDenied.error?.code).toBe("P4204");
  });

  it("arquiva sem abertas, preserva fechadas e rejeita nova criação", async () => {
    const opportunity = await pool.query<{ id: string; version: number }>(
      `select id, version from public.opportunities
       where pipeline_id = $1 and status = 'open' order by created_at limit 1`,
      [duplicatedPipelineA],
    );
    const closed = await ownerA.client.rpc("close_opportunity", {
      clinic_id: clinicA,
      close_reason: null,
      expected_version: opportunity.rows[0]!.version,
      opportunity_id: opportunity.rows[0]!.id,
      target_status: "won",
    });
    expect(closed.error).toBeNull();
    const archived = await ownerA.client.rpc("archive_pipeline", {
      clinic_id: clinicA, pipeline_id: duplicatedPipelineA,
    });
    expect(archived.error).toBeNull();

    const persisted = await pool.query<{ archived_at: string | null; status: string }>(
      `select p.archived_at, o.status
       from public.opportunities o join public.pipelines p on p.id = o.pipeline_id
       where o.id = $1`,
      [opportunity.rows[0]!.id],
    );
    expect(persisted.rows[0]?.archived_at).not.toBeNull();
    expect(persisted.rows[0]?.status).toBe("won");

    const [again, createDenied, defaultDenied] = await Promise.all([
      ownerA.client.rpc("archive_pipeline", {
        clinic_id: clinicA, pipeline_id: duplicatedPipelineA,
      }),
      createOpportunity(ownerA, clinicA, contactA, {
        confirmed: true, pipelineId: duplicatedPipelineA,
      }),
      ownerA.client.rpc("set_default_pipeline", {
        clinic_id: clinicA, pipeline_id: duplicatedPipelineA,
      }),
    ]);
    expect(again.error?.code).toBe("P4201");
    expect(createDenied.error?.code).toBe("P4201");
    expect(defaultDenied.error?.code).toBe("P4201");

    const historical = await ownerA.client.rpc("search_opportunity_board", {
      p_assigned_to_user_id: null,
      p_clinic_id: clinicA,
      p_initial_source_id: null,
      p_page: 1,
      p_page_size: 100,
      p_pipeline_id: null,
      p_search_term: "Bloqueia arquivamento",
      p_status: null,
    });
    expect(historical.error).toBeNull();
    expect(historical.data?.[0]).toMatchObject({
      id: opportunity.rows[0]!.id,
      pipeline_archived_at: expect.any(String),
      pipeline_id: duplicatedPipelineA,
      pipeline_name: "Comercial",
      status: "won",
    });
  });

  it("serializa criação de oportunidade contra arquivamento", async () => {
    const racePipeline = await createPipeline(ownerA, clinicA, "Pipeline de corrida");
    if (racePipeline.error || typeof racePipeline.data !== "string") throw racePipeline.error;
    const contact = await createContact(ownerA, clinicA, "Contato Corrida de Arquivamento");
    const [created, archived] = await Promise.all([
      createOpportunity(ownerA, clinicA, contact, { pipelineId: racePipeline.data }),
      ownerA.client.rpc("archive_pipeline", {
        clinic_id: clinicA, pipeline_id: racePipeline.data,
      }),
    ]);
    expect([created.error, archived.error].filter((error) => error === null)).toHaveLength(1);
    const errorCode = created.error?.code ?? archived.error?.code;
    expect(["P4201", "P4204"]).toContain(errorCode);
  });

  it("mantém leitura platform isolada, auditoria estrutural e zero escrita direta", async () => {
    const [platformPipelines, directUpdate, directDelete] = await Promise.all([
      platformAdmin.client.from("pipelines").select("id"),
      managerA.client.from("pipelines").update({ name: "Proibido" }).eq("id", defaultPipelineA),
      managerA.client.from("pipelines").delete().eq("id", defaultPipelineA),
    ]);
    expect(platformPipelines.data).toEqual([]);
    expect(directUpdate.error).not.toBeNull();
    expect(directDelete.error).not.toBeNull();

    const audits = await pool.query<{ action: string; payload: string }>(
      `select action, concat_ws(' ', before::text, after::text) as payload
       from public.audit_logs
       where clinic_id = $1 and action like 'pipeline.%'
       order by occurred_at, id`,
      [clinicA],
    );
    expect(audits.rows.map((row) => row.action)).toEqual(expect.arrayContaining([
      "pipeline.archived",
      "pipeline.created",
      "pipeline.default_changed",
      "pipeline.duplicated",
      "pipeline.renamed",
    ]));
    expect(audits.rows.every((row) =>
      !/phone|email|notes|contact_id|opportunity_id/i.test(row.payload)))
      .toBe(true);
  });
});
