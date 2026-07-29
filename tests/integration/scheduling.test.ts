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
let adminA: FixtureUser;
let receptionistA: FixtureUser;
let nonMember: FixtureUser;
let clinicA: string;
let clinicB: string;
let professionalA: string;
let procedureA: string;

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

function createProfessional(
  actor: FixtureUser,
  clinicId: string,
  name: string,
  idempotencyKey = crypto.randomUUID(),
) {
  return actor.client.rpc("create_professional", {
    clinic_id: clinicId,
    display_name: name,
    email: "profissional@example.test",
    phone: "(11) 99876-5432",
    professional_registration_type: "CRM",
    professional_registration_number: "12345",
    color: "#2563EB",
    notes: "Dado operacional fictício",
    idempotency_key: idempotencyKey,
  });
}

function createProcedure(
  actor: FixtureUser,
  clinicId: string,
  name: string,
  idempotencyKey = crypto.randomUUID(),
  price = 10_000,
  duration = 60,
) {
  return actor.client.rpc("create_procedure", {
    clinic_id: clinicId,
    name,
    description: "Procedimento fictício",
    category: "Estética",
    default_duration_minutes: duration,
    base_price_cents: price,
    color: "#7C3AED",
    idempotency_key: idempotencyKey,
  });
}

beforeAll(async () => {
  [ownerA, ownerB, managerA, adminA, receptionistA, nonMember] = await Promise.all([
    createUser("schedule-owner-a", true),
    createUser("schedule-owner-b", true),
    createUser("schedule-manager-a", true),
    createUser("schedule-admin-a"),
    createUser("schedule-reception-a"),
    createUser("schedule-outsider", true),
  ]);
  const clinics = await pool.query<{ id: string; name: string }>(
    `insert into public.clinics (name, slug, timezone, created_by)
     values ('Clínica Scheduling A', $1, 'America/Sao_Paulo', $3),
            ('Clínica Scheduling B', $2, 'Europe/Lisbon', $4)
     returning id, name`,
    [`schedule-a-${crypto.randomUUID()}`, `schedule-b-${crypto.randomUUID()}`, ownerA.id, ownerB.id],
  );
  clinicA = clinics.rows.find((clinic) => clinic.name.endsWith("A"))!.id;
  clinicB = clinics.rows.find((clinic) => clinic.name.endsWith("B"))!.id;
  clinicIds.push(clinicA, clinicB);
  await pool.query(
    `insert into public.clinic_members (clinic_id, user_id, role) values
       ($1, $3, 'owner'), ($2, $4, 'owner'), ($1, $5, 'manager'),
       ($2, $5, 'professional'), ($1, $6, 'admin'), ($1, $7, 'receptionist')`,
    [clinicA, clinicB, ownerA.id, ownerB.id, managerA.id, adminA.id, receptionistA.id],
  );
  const professional = await createProfessional(ownerA, clinicA, "Dra. Ana Base");
  if (professional.error || typeof professional.data !== "string") throw professional.error;
  professionalA = professional.data;
  const procedure = await createProcedure(ownerA, clinicA, "Consulta Base");
  if (procedure.error || typeof procedure.data !== "string") throw procedure.error;
  procedureA = procedure.data;
});

afterAll(async () => {
  if (clinicIds.length) {
    await pool.query("delete from public.audit_logs where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.professional_weekly_availability where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.professional_procedures where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.professional_specialties where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.professionals where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.procedures where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.clinics where id = any($1::uuid[])", [clinicIds]);
  }
  for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  await pool.end();
});

describe("scheduling F2.3.1 multi-tenant", () => {
  it("cria profissional com replay e concorrência idempotentes sem duplicar auditoria", async () => {
    const key = crypto.randomUUID();
    const concurrent = await Promise.all([
      createProfessional(ownerA, clinicA, "Dra. Concorrente", key),
      createProfessional(ownerA, clinicA, "Nome ignorado no replay", key),
    ]);
    expect(concurrent.every((result) => result.error === null)).toBe(true);
    expect(concurrent[0]!.data).toBe(concurrent[1]!.data);
    const repeated = await createProfessional(ownerA, clinicA, "Outro replay", key);
    expect(repeated.data).toBe(concurrent[0]!.data);
    const persisted = await pool.query<{ count: string }>(
      "select count(*)::text from public.professionals where clinic_id = $1 and creation_idempotency_key = $2",
      [clinicA, key],
    );
    const audit = await pool.query<{ count: string }>(
      `select count(*)::text from public.audit_logs
       where clinic_id = $1 and entity_id = $2 and action = 'professional.created'`,
      [clinicA, concurrent[0]!.data],
    );
    expect(persisted.rows).toEqual([{ count: "1" }]);
    expect(audit.rows).toEqual([{ count: "1" }]);
  });

  it("bloqueia cross-tenant, falta de permissão e ausência de AAL2", async () => {
    const [crossTenant, forbidden, noAal2] = await Promise.all([
      createProfessional(ownerA, clinicB, "Cross tenant"),
      createProfessional(receptionistA, clinicA, "Sem permissão"),
      createProfessional(adminA, clinicA, "Sem AAL2"),
    ]);
    expect(crossTenant.error?.code).toBe("42501");
    expect(forbidden.error?.code).toBe("42501");
    expect(noAal2.error?.code).toBe("42501");
  });

  it("aplica optimistic concurrency e soft archive idempotente", async () => {
    const current = await pool.query<{ version: number }>(
      "select version from public.professionals where id = $1", [professionalA],
    );
    const input = {
      clinic_id: clinicA,
      professional_id: professionalA,
      display_name: "Dra. Ana Atualizada",
      email: null,
      phone: null,
      professional_registration_type: null,
      professional_registration_number: null,
      color: "#0F766E",
      status: "active",
      notes: null,
      expected_version: current.rows[0]!.version,
    };
    const updates = await Promise.all([
      ownerA.client.rpc("update_professional", input),
      ownerA.client.rpc("update_professional", { ...input, display_name: "Perdedora" }),
    ]);
    expect(updates.filter((result) => result.error === null)).toHaveLength(1);
    expect(updates.find((result) => result.error)?.error?.code).toBe("P4091");
  });

  it("substitui especialidades atomicamente e rejeita duplicação case-insensitive", async () => {
    const set = await ownerA.client.rpc("set_professional_specialties", {
      clinic_id: clinicA,
      professional_id: professionalA,
      specialties: ["Dermatologia", "Estética"],
    });
    const duplicate = await ownerA.client.rpc("set_professional_specialties", {
      clinic_id: clinicA,
      professional_id: professionalA,
      specialties: ["Dermatologia", " dermatologia "],
    });
    expect(set.error).toBeNull();
    expect(duplicate.error?.code).toBe("22023");
    const rows = await pool.query<{ name: string }>(
      "select name from public.professional_specialties where professional_id = $1 order by name",
      [professionalA],
    );
    expect(rows.rows.map((row) => row.name)).toEqual(["Dermatologia", "Estética"]);
  });

  it("vincula somente membro ativo da mesma clínica e mantém unicidade ativa", async () => {
    const linked = await ownerA.client.rpc("link_professional_user", {
      clinic_id: clinicA, professional_id: professionalA, linked_user_id: managerA.id,
    });
    const replay = await ownerA.client.rpc("link_professional_user", {
      clinic_id: clinicA, professional_id: professionalA, linked_user_id: managerA.id,
    });
    const second = await createProfessional(ownerA, clinicA, "Outro profissional");
    const duplicate = await ownerA.client.rpc("link_professional_user", {
      clinic_id: clinicA, professional_id: second.data!, linked_user_id: managerA.id,
    });
    const outsider = await ownerA.client.rpc("link_professional_user", {
      clinic_id: clinicA, professional_id: second.data!, linked_user_id: nonMember.id,
    });
    const foreign = await ownerA.client.rpc("link_professional_user", {
      clinic_id: clinicA, professional_id: second.data!, linked_user_id: ownerB.id,
    });
    expect(linked.error).toBeNull();
    expect(replay.error).toBeNull();
    expect(duplicate.error?.code).toBe("P4303");
    expect(outsider.error?.code).toBe("P4304");
    expect(foreign.error?.code).toBe("P4304");
    const professionalB = await createProfessional(ownerB, clinicB, "Profissional multi-clínica");
    const linkedInOtherClinic = await ownerB.client.rpc("link_professional_user", {
      clinic_id: clinicB, professional_id: professionalB.data!, linked_user_id: managerA.id,
    });
    expect(linkedInOtherClinic.error).toBeNull();
    const unlinked = await ownerA.client.rpc("unlink_professional_user", {
      clinic_id: clinicA, professional_id: professionalA,
    });
    expect(unlinked.error).toBeNull();
  });

  it("cria procedimento idempotente, aceita preço zero e bloqueia nome concorrente", async () => {
    const key = crypto.randomUUID();
    const replay = await Promise.all([
      createProcedure(ownerA, clinicA, "Procedimento Idempotente", key, 0, 5),
      createProcedure(ownerA, clinicA, "Nome ignorado", key, 999, 10),
    ]);
    expect(replay.every((result) => result.error === null)).toBe(true);
    expect(replay[0]!.data).toBe(replay[1]!.data);
    const duplicateName = await Promise.all([
      createProcedure(ownerA, clinicA, "Nome Concorrente"),
      createProcedure(ownerA, clinicA, "  nome concorrente  "),
    ]);
    expect(duplicateName.filter((result) => result.error === null)).toHaveLength(1);
    expect(duplicateName.find((result) => result.error)?.error?.code).toBe("P4307");
    expect((await createProcedure(ownerA, clinicA, "Preço inválido", undefined, -1)).error?.code)
      .toBe("22023");
    expect((await createProcedure(ownerA, clinicA, "Duração inválida", undefined, 0, 4)).error?.code)
      .toBe("22023");
  });

  it("atualiza procedimento com versão otimista e arquiva de forma idempotente", async () => {
    const created = await createProcedure(ownerA, clinicA, "Procedimento Versionado");
    const input = {
      clinic_id: clinicA,
      procedure_id: created.data!,
      name: "Procedimento Versionado Atualizado",
      description: null,
      category: null,
      default_duration_minutes: 30,
      base_price_cents: 0,
      color: "#0F766E",
      status: "active",
      expected_version: 1,
    };
    const updates = await Promise.all([
      ownerA.client.rpc("update_procedure", input),
      ownerA.client.rpc("update_procedure", { ...input, name: "Atualização perdedora" }),
    ]);
    expect(updates.filter((result) => result.error === null)).toHaveLength(1);
    expect(updates.find((result) => result.error)?.error?.code).toBe("P4091");
    const archived = await ownerA.client.rpc("archive_procedure", {
      clinic_id: clinicA, procedure_id: created.data!,
    });
    const replay = await ownerA.client.rpc("archive_procedure", {
      clinic_id: clinicA, procedure_id: created.data!,
    });
    expect(archived.error).toBeNull();
    expect(replay.error).toBeNull();
    expect((await ownerA.client.rpc("set_professional_procedure", {
      clinic_id: clinicA, professional_id: professionalA, procedure_id: created.data!,
      duration_minutes_override: null, price_cents_override: null, expected_version: null,
    })).error?.code).toBe("P4306");
  });

  it("vincula procedimento com fallback/override e arquiva sem apagar histórico", async () => {
    const foreignProfessional = await createProfessional(ownerB, clinicB, "Profissional B");
    const foreignProcedure = await createProcedure(ownerB, clinicB, "Procedimento B");
    const [crossProfessional, crossProcedure] = await Promise.all([
      ownerA.client.rpc("set_professional_procedure", {
        clinic_id: clinicA, professional_id: foreignProfessional.data!, procedure_id: procedureA,
        duration_minutes_override: null, price_cents_override: null, expected_version: null,
      }),
      ownerA.client.rpc("set_professional_procedure", {
        clinic_id: clinicA, professional_id: professionalA, procedure_id: foreignProcedure.data!,
        duration_minutes_override: null, price_cents_override: null, expected_version: null,
      }),
    ]);
    expect(crossProfessional.error?.code).toBe("P4301");
    expect(crossProcedure.error?.code).toBe("P4305");
    const concurrentFallback = await Promise.all([
      ownerA.client.rpc("set_professional_procedure", {
        clinic_id: clinicA, professional_id: professionalA, procedure_id: procedureA,
        duration_minutes_override: null, price_cents_override: null, expected_version: null,
      }),
      ownerA.client.rpc("set_professional_procedure", {
        clinic_id: clinicA, professional_id: professionalA, procedure_id: procedureA,
        duration_minutes_override: null, price_cents_override: null, expected_version: null,
      }),
    ]);
    expect(concurrentFallback.every((result) => result.error === null)).toBe(true);
    expect(concurrentFallback[0]!.data).toBe(concurrentFallback[1]!.data);
    const fallback = concurrentFallback[0]!;
    const current = await pool.query<{ version: number }>(
      "select version from public.professional_procedures where id = $1",
      [fallback.data],
    );
    const expectedVersion = current.rows[0]!.version;
    const variants = [
      { duration_minutes_override: 45, price_cents_override: 8_000 },
      { duration_minutes_override: 30, price_cents_override: 9_000 },
    ];
    const concurrentUpdates = await Promise.all(variants.map((variant) =>
      ownerA.client.rpc("set_professional_procedure", {
        clinic_id: clinicA,
        professional_id: professionalA,
        procedure_id: procedureA,
        ...variant,
        expected_version: expectedVersion,
      })));
    expect(concurrentUpdates.filter((result) => result.error === null)).toHaveLength(1);
    expect(concurrentUpdates.find((result) => result.error)?.error?.code).toBe("P4091");
    const winnerIndex = concurrentUpdates.findIndex((result) => result.error === null);
    const winner = variants[winnerIndex]!;
    const persisted = await pool.query<{
      duration_minutes_override: number;
      price_cents_override: string;
      version: number;
    }>(
      `select duration_minutes_override, price_cents_override::text, version
       from public.professional_procedures where id = $1`,
      [fallback.data],
    );
    expect(persisted.rows).toEqual([{
      duration_minutes_override: winner.duration_minutes_override,
      price_cents_override: String(winner.price_cents_override),
      version: expectedVersion + 1,
    }]);
    const replay = await ownerA.client.rpc("set_professional_procedure", {
      clinic_id: clinicA,
      professional_id: professionalA,
      procedure_id: procedureA,
      ...winner,
      expected_version: expectedVersion,
    });
    expect(replay.error).toBeNull();
    expect(replay.data).toBe(fallback.data);
    const effective = await ownerA.client.rpc("search_professional_procedures", {
      p_clinic_id: clinicA, p_professional_id: professionalA, p_procedure_id: procedureA,
      p_page: 1, p_page_size: 10,
    });
    expect(effective.data?.[0]).toMatchObject({
      default_duration_minutes: 60,
      effective_duration_minutes: winner.duration_minutes_override,
      has_duration_override: true,
      base_price_cents: 10_000,
      effective_price_cents: winner.price_cents_override,
      has_price_override: true,
      version: expectedVersion + 1,
    });
    const archived = await ownerA.client.rpc("archive_professional_procedure", {
      clinic_id: clinicA, professional_procedure_id: fallback.data!,
    });
    expect(archived.error).toBeNull();
    expect((await pool.query("select id from public.professional_procedures where id = $1", [fallback.data])).rowCount)
      .toBe(1);
  });

  it("substitui disponibilidade local, aceita adjacência e rejeita overlap/intervalos inválidos", async () => {
    const initial = await pool.query<{ version: number }>(
      "select version from public.professionals where id = $1",
      [professionalA],
    );
    const initialVersion = initial.rows[0]!.version;
    const validAvailability = [
      { weekday: 1, start_minute: 480, end_minute: 720 },
      { weekday: 1, start_minute: 720, end_minute: 900 },
      { weekday: 3, start_minute: 600, end_minute: 720 },
    ];
    const valid = await ownerA.client.rpc("set_professional_weekly_availability", {
      clinic_id: clinicA,
      professional_id: professionalA,
      availability: validAvailability,
      expected_version: initialVersion,
    });
    expect(valid.error).toBeNull();
    expect(valid.data).toBe(initialVersion + 1);
    const replay = await ownerA.client.rpc("set_professional_weekly_availability", {
      clinic_id: clinicA,
      professional_id: professionalA,
      availability: [...validAvailability].reverse(),
      expected_version: initialVersion,
    });
    expect(replay.error).toBeNull();
    expect(replay.data).toBe(valid.data);
    for (const availability of [
      [{ weekday: 1, start_minute: 480, end_minute: 700 }, { weekday: 1, start_minute: 699, end_minute: 800 }],
      [{ weekday: 1, start_minute: 480, end_minute: 480 }],
      [{ weekday: 1, start_minute: 600, end_minute: 480 }],
    ]) {
      const result = await ownerA.client.rpc("set_professional_weekly_availability", {
        clinic_id: clinicA,
        professional_id: professionalA,
        availability,
        expected_version: valid.data!,
      });
      expect(["P4309", "P4310"]).toContain(result.error?.code);
    }
    const preserved = await pool.query<{ count: string }>(
      "select count(*)::text from public.professional_weekly_availability where professional_id = $1",
      [professionalA],
    );
    expect(preserved.rows).toEqual([{ count: "3" }]);

    const availabilityVariants = [
      [
        { weekday: 2, start_minute: 480, end_minute: 600 },
        { weekday: 2, start_minute: 600, end_minute: 720 },
      ],
      [
        { weekday: 4, start_minute: 720, end_minute: 840 },
        { weekday: 4, start_minute: 840, end_minute: 960 },
      ],
    ];
    const concurrent = await Promise.all(availabilityVariants.map((availability) =>
      ownerA.client.rpc("set_professional_weekly_availability", {
        clinic_id: clinicA,
        professional_id: professionalA,
        availability,
        expected_version: valid.data!,
      })));
    expect(concurrent.filter((result) => result.error === null)).toHaveLength(1);
    expect(concurrent.find((result) => result.error)?.error?.code).toBe("P4091");
    const winnerIndex = concurrent.findIndex((result) => result.error === null);
    const final = await pool.query<{ end_minute: number; start_minute: number; weekday: number }>(
      `select weekday, start_minute, end_minute
       from public.professional_weekly_availability
       where professional_id = $1 order by weekday, start_minute`,
      [professionalA],
    );
    expect(final.rows).toEqual(availabilityVariants[winnerIndex]);
    expect(final.rows[0]!.end_minute).toBe(final.rows[1]!.start_minute);
    const professional = await pool.query<{ updated_by: string; version: number }>(
      "select version, updated_by from public.professionals where id = $1",
      [professionalA],
    );
    expect(professional.rows).toEqual([{
      updated_by: ownerA.id,
      version: valid.data! + 1,
    }]);
  });

  it("isola leituras e escritas e rejeita disponibilidade em profissional arquivado", async () => {
    for (const table of [
      "professionals", "professional_specialties", "procedures",
      "professional_procedures", "professional_weekly_availability",
    ] as const) {
      const foreign = await ownerB.client.from(table).select("id").eq("clinic_id", clinicA);
      expect(foreign.error).toBeNull();
      expect(foreign.data).toEqual([]);
    }
    const archived = await ownerA.client.rpc("archive_professional", {
      clinic_id: clinicA, professional_id: professionalA,
    });
    const replay = await ownerA.client.rpc("archive_professional", {
      clinic_id: clinicA, professional_id: professionalA,
    });
    const archivedVersion = await pool.query<{ version: number }>(
      "select version from public.professionals where id = $1",
      [professionalA],
    );
    const unavailable = await ownerA.client.rpc("set_professional_weekly_availability", {
      clinic_id: clinicA,
      professional_id: professionalA,
      availability: [],
      expected_version: archivedVersion.rows[0]!.version,
    });
    expect(archived.error).toBeNull();
    expect(replay.error).toBeNull();
    expect(unavailable.error?.code).toBe("P4302");
  });

  it("mantém auditoria estrutural sem valores pessoais", async () => {
    const audit = await pool.query<{ action: string; after: unknown }>(
      `select action, after from public.audit_logs
       where clinic_id = $1 and entity in ('professional', 'procedure', 'professional_procedure')
       order by occurred_at, id`,
      [clinicA],
    );
    const serialized = JSON.stringify(audit.rows);
    expect(serialized).not.toContain("profissional@example.test");
    expect(serialized).not.toContain("+5511998765432");
    expect(serialized).not.toContain("12345");
    expect(audit.rows.some((row) => row.action === "professional.created")).toBe(true);
    expect(audit.rows.some((row) => row.action === "procedure.created")).toBe(true);
  });
});
