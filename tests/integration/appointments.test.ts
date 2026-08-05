import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestAdminClient, createTestUserClient } from "./helpers/create-test-admin-client";
import { createTestDbPool } from "./helpers/create-test-db-client";
import { currentTotp } from "./helpers/totp";

/**
 * Agendamentos F4 no banco real: isolamento por tenant, autorização, AAL2,
 * idempotência, overlap por profissional e concorrência otimista.
 *
 * Todos os instantes são fixos e no futuro relativo a uma data-base própria do
 * teste, para não depender do relógio da máquina que roda a suíte.
 */

const password = "Local-only-test-password-123!";
const pool = createTestDbPool();
const admin = createTestAdminClient();
const userIds: string[] = [];
const clinicIds: string[] = [];

const DAY = "2027-03-15";
const at = (time: string) => `${DAY}T${time}:00.000Z`;

type FixtureUser = Awaited<ReturnType<typeof createUser>>;
let ownerA: FixtureUser;
let ownerB: FixtureUser;
let receptionistA: FixtureUser;
/** Mesma permissão da recepção, mas sem segundo fator verificado. */
let weakReceptionistA: FixtureUser;
let viewerA: FixtureUser;
let clinicA: string;
let clinicB: string;
let professionalA: string;
let procedureA: string;
let contactA: string;

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

function schedule(actor: FixtureUser, overrides: Record<string, unknown> = {}) {
  return actor.client.rpc("create_appointment", {
    clinic_id: clinicA,
    contact_id: contactA,
    professional_id: professionalA,
    procedure_id: procedureA,
    custom_procedure_name: null,
    start_at: at("13:00"),
    duration_minutes: null,
    price_cents: null,
    notes: null,
    idempotency_key: crypto.randomUUID(),
    ...overrides,
  });
}

beforeAll(async () => {
  [ownerA, ownerB, receptionistA, weakReceptionistA, viewerA] = await Promise.all([
    createUser("apt-owner-a", true),
    createUser("apt-owner-b", true),
    createUser("apt-reception-a", true),
    createUser("apt-reception-weak-a"),
    createUser("apt-viewer-a", true),
  ]);
  const clinics = await pool.query<{ id: string; name: string }>(
    `insert into public.clinics (name, slug, timezone, created_by)
     values ('Clínica Agenda A', $1, 'America/Sao_Paulo', $3),
            ('Clínica Agenda B', $2, 'Europe/Lisbon', $4)
     returning id, name`,
    [`apt-a-${crypto.randomUUID()}`, `apt-b-${crypto.randomUUID()}`, ownerA.id, ownerB.id],
  );
  clinicA = clinics.rows.find((clinic) => clinic.name.endsWith("A"))!.id;
  clinicB = clinics.rows.find((clinic) => clinic.name.endsWith("B"))!.id;
  clinicIds.push(clinicA, clinicB);
  await pool.query(
    `insert into public.clinic_members (clinic_id, user_id, role) values
       ($1, $3, 'owner'), ($2, $4, 'owner'),
       ($1, $5, 'receptionist'), ($1, $6, 'receptionist'), ($1, $7, 'viewer')`,
    [
      clinicA, clinicB, ownerA.id, ownerB.id,
      receptionistA.id, weakReceptionistA.id, viewerA.id,
    ],
  );

  const professional = await ownerA.client.rpc("create_professional", {
    clinic_id: clinicA,
    display_name: "Dra. Ana Agenda",
    email: "agenda@example.test",
    phone: "(11) 99876-5432",
    professional_registration_type: "CRM",
    professional_registration_number: "12345",
    color: "#2563EB",
    notes: null,
    idempotency_key: crypto.randomUUID(),
  });
  if (professional.error || typeof professional.data !== "string") throw professional.error;
  professionalA = professional.data;

  const procedure = await ownerA.client.rpc("create_procedure", {
    clinic_id: clinicA,
    name: "Limpeza de pele",
    description: null,
    category: null,
    default_duration_minutes: 60,
    base_price_cents: 25_000,
    color: "#7C3AED",
    idempotency_key: crypto.randomUUID(),
  });
  if (procedure.error || typeof procedure.data !== "string") throw procedure.error;
  procedureA = procedure.data;

  const contact = await ownerA.client.rpc("create_contact", {
    clinic_id: clinicA,
    full_name: "Maria Fictícia",
    notes: null,
    idempotency_key: crypto.randomUUID(),
    methods: [],
    link_as_patient: true,
  });
  if (contact.error || typeof contact.data !== "string") throw contact.error;
  contactA = contact.data;
});

afterAll(async () => {
  if (clinicIds.length) {
    await pool.query("delete from public.audit_logs where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.appointments where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.professional_procedures where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.professionals where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.procedures where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.patients where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.person_contacts where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.contacts where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.clinics where id = any($1::uuid[])", [clinicIds]);
  }
  for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  await pool.end();
});

describe("agendamentos F4", () => {
  it("congela duração e preço do catálogo e é idempotente na criação", async () => {
    const key = crypto.randomUUID();
    const first = await schedule(ownerA, { idempotency_key: key, start_at: at("11:00") });
    const replay = await schedule(ownerA, { idempotency_key: key, start_at: at("11:00") });

    expect(first.error).toBeNull();
    expect(replay.error).toBeNull();
    expect(replay.data).toBe(first.data);

    const stored = await pool.query<{
      duration_minutes: number;
      price_cents: string;
      status: string;
      version: number;
    }>(
      "select duration_minutes, price_cents, status, version from public.appointments where id = $1",
      [first.data],
    );
    expect(stored.rows).toEqual([{
      duration_minutes: 60,
      price_cents: "25000",
      status: "confirmed",
      version: 1,
    }]);
  });

  it("recusa sobreposição do mesmo profissional e libera horário adjacente", async () => {
    const base = await schedule(ownerA, { start_at: at("14:00") });
    const overlapping = await schedule(ownerA, { start_at: at("14:30") });
    const adjacent = await schedule(ownerA, { start_at: at("15:00") });

    expect(base.error).toBeNull();
    expect(overlapping.error?.code).toBe("P4313");
    expect(adjacent.error).toBeNull();
  });

  it("libera o horário de um agendamento cancelado", async () => {
    const created = await schedule(ownerA, { start_at: at("17:00") });
    expect(created.error).toBeNull();
    const canceled = await ownerA.client.rpc("update_appointment_status", {
      clinic_id: clinicA,
      appointment_id: created.data as string,
      new_status: "canceled",
      expected_version: 1,
    });
    const reused = await schedule(ownerA, { start_at: at("17:00") });

    expect(canceled.error).toBeNull();
    expect(reused.error).toBeNull();
  });

  it("mantém cancelamento terminal e detecta versão obsoleta", async () => {
    const created = await schedule(ownerA, { start_at: at("18:00") });
    const arrived = await ownerA.client.rpc("update_appointment_status", {
      clinic_id: clinicA,
      appointment_id: created.data as string,
      new_status: "arrived",
      expected_version: 1,
    });
    const stale = await ownerA.client.rpc("update_appointment_status", {
      clinic_id: clinicA,
      appointment_id: created.data as string,
      new_status: "paid",
      expected_version: 1,
    });
    const canceled = await ownerA.client.rpc("update_appointment_status", {
      clinic_id: clinicA,
      appointment_id: created.data as string,
      new_status: "canceled",
      expected_version: arrived.data as number,
    });
    const afterCancel = await ownerA.client.rpc("update_appointment_status", {
      clinic_id: clinicA,
      appointment_id: created.data as string,
      new_status: "paid",
      expected_version: (arrived.data as number) + 1,
    });

    expect(arrived.data).toBe(2);
    expect(stale.error?.code).toBe("P4091");
    expect(canceled.error).toBeNull();
    expect(afterCancel.error?.code).toBe("P4312");
  });

  it("exige exatamente uma origem de procedimento e recusa contato inexistente", async () => {
    const both = await schedule(ownerA, {
      custom_procedure_name: "Avulso",
      start_at: at("19:00"),
    });
    const neither = await schedule(ownerA, {
      procedure_id: null,
      start_at: at("19:00"),
    });
    const custom = await schedule(ownerA, {
      procedure_id: null,
      custom_procedure_name: "Avulso",
      duration_minutes: 30,
      price_cents: 9_900,
      start_at: at("19:00"),
    });
    const unknownContact = await schedule(ownerA, {
      contact_id: crypto.randomUUID(),
      start_at: at("21:00"),
    });

    expect(both.error?.code).toBe("22023");
    expect(neither.error?.code).toBe("22023");
    expect(custom.error).toBeNull();
    expect(unknownContact.error?.code).toBe("P4315");
  });

  it("permite a recepção gerenciar e bloqueia quem só enxerga ou não fez MFA", async () => {
    const byReception = await schedule(receptionistA, { start_at: at("22:00") });
    const byViewer = await schedule(viewerA, { start_at: at("23:00") });
    const withoutAal2 = await schedule(weakReceptionistA, { start_at: at("23:00") });

    expect(byReception.error).toBeNull();
    expect(byViewer.error?.code).toBe("42501");
    expect(withoutAal2.error?.code).toBe("42501");
  });

  it("isola leitura e escrita entre clínicas", async () => {
    const created = await schedule(ownerA, { start_at: at("10:00") });
    expect(created.error).toBeNull();

    const foreignRead = await ownerB.client
      .from("appointments").select("id").eq("clinic_id", clinicA);
    const ownRead = await ownerA.client
      .from("appointments").select("id").eq("clinic_id", clinicA);
    const foreignWrite = await ownerB.client.rpc("update_appointment_status", {
      clinic_id: clinicA,
      appointment_id: created.data as string,
      new_status: "paid",
      expected_version: 1,
    });
    const directInsert = await ownerA.client.from("appointments").insert({
      clinic_id: clinicA,
      contact_id: contactA,
      professional_id: professionalA,
      procedure_id: procedureA,
      start_at: at("09:00"),
      duration_minutes: 30,
      price_cents: 100,
      creation_idempotency_key: crypto.randomUUID(),
      created_by: ownerA.id,
      updated_by: ownerA.id,
    });

    expect(foreignRead.error).toBeNull();
    expect(foreignRead.data).toEqual([]);
    expect(ownRead.data?.length).toBeGreaterThan(0);
    expect(foreignWrite.error?.code).toBe("42501");
    expect(directInsert.error).not.toBeNull();
  });

  it("remarca respeitando overlap e versão", async () => {
    const created = await schedule(ownerA, { start_at: at("07:00") });
    const blocked = await ownerA.client.rpc("reschedule_appointment", {
      clinic_id: clinicA,
      appointment_id: created.data as string,
      professional_id: professionalA,
      start_at: at("14:00"),
      duration_minutes: 60,
      expected_version: 1,
    });
    const moved = await ownerA.client.rpc("reschedule_appointment", {
      clinic_id: clinicA,
      appointment_id: created.data as string,
      professional_id: professionalA,
      start_at: at("08:00"),
      duration_minutes: 45,
      expected_version: 1,
    });

    expect(blocked.error?.code).toBe("P4313");
    expect(moved.data).toBe(2);

    const stored = await pool.query<{ duration_minutes: number; start_at: Date }>(
      "select duration_minutes, start_at from public.appointments where id = $1",
      [created.data],
    );
    expect(stored.rows[0]!.duration_minutes).toBe(45);
    expect(stored.rows[0]!.start_at.toISOString()).toBe(at("08:00"));
  });

  it("devolve a agenda pela busca com nomes resolvidos e recusa janela ampla", async () => {
    const page = await ownerA.client.rpc("search_appointments", {
      p_clinic_id: clinicA,
      p_contact_id: null,
      p_from: `${DAY}T00:00:00.000Z`,
      p_page: 1,
      p_page_size: 100,
      p_professional_id: null,
      p_status: null,
      p_to: `2027-03-16T00:00:00.000Z`,
    });
    const tooWide = await ownerA.client.rpc("search_appointments", {
      p_clinic_id: clinicA,
      p_contact_id: null,
      p_from: `${DAY}T00:00:00.000Z`,
      p_page: 1,
      p_page_size: 100,
      p_professional_id: null,
      p_status: null,
      p_to: `2027-06-16T00:00:00.000Z`,
    });

    expect(page.error).toBeNull();
    expect(page.data!.length).toBeGreaterThan(0);
    expect(page.data![0]).toMatchObject({
      contact_name: "Maria Fictícia",
      professional_name: "Dra. Ana Agenda",
    });
    // Fora da janela permitida a leitura devolve vazio em vez de varrer o banco.
    expect(tooWide.error).toBeNull();
    expect(tooWide.data).toEqual([]);
  });

  it("registra auditoria de criação e mudança de status", async () => {
    const created = await schedule(ownerA, { start_at: at("06:00") });
    await ownerA.client.rpc("update_appointment_status", {
      clinic_id: clinicA,
      appointment_id: created.data as string,
      new_status: "paid",
      expected_version: 1,
    });

    const events = await pool.query<{ action: string }>(
      `select action from public.audit_logs
       where clinic_id = $1 and entity = 'appointment' and entity_id = $2
       order by action`,
      [clinicA, created.data],
    );
    expect(events.rows.map((row) => row.action)).toEqual([
      "appointment.created",
      "appointment.status_changed",
    ]);
  });
});
