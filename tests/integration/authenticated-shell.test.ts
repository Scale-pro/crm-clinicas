import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  canSelectClinic,
  resolveClinicSelection,
  signActiveClinicValue,
  verifyActiveClinicValue,
  type ClinicChoice,
} from "@/shared/auth/active-clinic-cookie";

import {
  createTestAdminClient,
  createTestUserClient,
} from "./helpers/create-test-admin-client";
import { createTestDbPool } from "./helpers/create-test-db-client";

const PASSWORD = "Local-only-test-password-123!";
const COOKIE_SECRET = "local-integration-cookie-secret-at-least-32-characters";
const admin = createTestAdminClient();
const pool = createTestDbPool();

type FixtureUser = {
  client: ReturnType<typeof createTestUserClient>;
  id: string;
};

const users: FixtureUser[] = [];
const clinicIds: string[] = [];
let clinicA: string;
let clinicB: string;
let ownerA: FixtureUser;
let ownerB: FixtureUser;
let single: FixtureUser;
let multi: FixtureUser;
let removed: FixtureUser;
let suspended: FixtureUser;
let withoutClinic: FixtureUser;

async function createUser(label: string): Promise<FixtureUser> {
  const email = `${label}-${crypto.randomUUID()}@example.test`;
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: PASSWORD,
  });
  if (created.error || !created.data.user) throw created.error ?? new Error("Usuário local não criado.");
  const client = createTestUserClient();
  const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  const fixture = { client, id: created.data.user.id };
  users.push(fixture);
  return fixture;
}

async function activeChoices(user: FixtureUser): Promise<ClinicChoice[]> {
  const memberships = await user.client.rpc("current_user_clinic_ids");
  expect(memberships.error).toBeNull();
  if (!memberships.data?.length) return [];
  const clinics = await user.client
    .from("clinics")
    .select("id,name,slug,timezone")
    .in("id", memberships.data)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name");
  expect(clinics.error).toBeNull();
  return (clinics.data ?? []) as ClinicChoice[];
}

beforeAll(async () => {
  [ownerA, ownerB, single, multi, removed, suspended, withoutClinic] = await Promise.all([
    createUser("shell-owner-a"),
    createUser("shell-owner-b"),
    createUser("shell-single"),
    createUser("shell-multi"),
    createUser("shell-removed"),
    createUser("shell-suspended"),
    createUser("shell-empty"),
  ]);

  const clinics = await pool.query<{ id: string; name: string }>(
    `insert into public.clinics (name, slug, timezone, created_by)
     values
       ('Shell Clínica A', $1, 'America/Sao_Paulo', $3),
       ('Shell Clínica B', $2, 'America/Recife', $4)
     returning id, name`,
    [`shell-a-${crypto.randomUUID()}`, `shell-b-${crypto.randomUUID()}`, ownerA.id, ownerB.id],
  );
  clinicA = clinics.rows.find((clinic) => clinic.name.endsWith("A"))!.id;
  clinicB = clinics.rows.find((clinic) => clinic.name.endsWith("B"))!.id;
  clinicIds.push(clinicA, clinicB);

  await pool.query(
    `insert into public.clinic_members (clinic_id, user_id, role, status)
     values
       ($1, $3, 'owner', 'active'),
       ($2, $4, 'owner', 'active'),
       ($1, $5, 'viewer', 'active'),
       ($1, $6, 'viewer', 'active'),
       ($2, $6, 'viewer', 'active'),
       ($1, $7, 'viewer', 'active'),
       ($1, $8, 'viewer', 'active')`,
    [clinicA, clinicB, ownerA.id, ownerB.id, single.id, multi.id, removed.id, suspended.id],
  );
});

afterAll(async () => {
  if (clinicIds.length) {
    await pool.query("delete from public.audit_logs where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.clinics where id = any($1::uuid[])", [clinicIds]);
  }
  for (const user of users) await admin.auth.admin.deleteUser(user.id);
  await pool.end();
});

describe("contexto real do shell autenticado", () => {
  it("usuário autenticado com uma clínica resolve o único contexto permitido", async () => {
    const clinics = await activeChoices(single);
    expect(clinics.map((clinic) => clinic.id)).toEqual([clinicA]);
    expect(resolveClinicSelection(clinics, null)).toMatchObject({
      kind: "selected",
      persisted: false,
      clinic: { id: clinicA },
    });
  });

  it("usuário com duas clínicas alterna somente entre memberships retornadas pelo servidor", async () => {
    const clinics = await activeChoices(multi);
    expect(new Set(clinics.map((clinic) => clinic.id))).toEqual(new Set([clinicA, clinicB]));
    expect(resolveClinicSelection(clinics, null).kind).toBe("selection_required");
    for (const clinicId of [clinicA, clinicB]) {
      expect(canSelectClinic(clinicId, clinics)).toBe(true);
      const verified = verifyActiveClinicValue(signActiveClinicValue(clinicId, COOKIE_SECRET), COOKIE_SECRET);
      expect(resolveClinicSelection(clinics, verified)).toMatchObject({ kind: "selected", clinic: { id: clinicId }, persisted: true });
    }
  });

  it("usuário da clínica A não seleciona a clínica B", async () => {
    const clinics = await activeChoices(ownerA);
    expect(canSelectClinic(clinicB, clinics)).toBe(false);
    const stale = verifyActiveClinicValue(signActiveClinicValue(clinicB, COOKIE_SECRET), COOKIE_SECRET);
    const resolution = resolveClinicSelection(clinics, stale);
    expect(resolution).toMatchObject({ kind: "selected", clinic: { id: clinicA }, persisted: false });
  });

  it("cookie assinado para clínica sem membership não concede contexto", async () => {
    const clinics = await activeChoices(withoutClinic);
    const verified = verifyActiveClinicValue(signActiveClinicValue(clinicA, COOKIE_SECRET), COOKIE_SECRET);
    expect(resolveClinicSelection(clinics, verified)).toEqual({ kind: "empty" });
  });

  it("cookie adulterado não seleciona clínica", async () => {
    const clinics = await activeChoices(multi);
    const valid = signActiveClinicValue(clinicA, COOKIE_SECRET);
    const tampered = valid.replace(clinicA, clinicB);
    expect(verifyActiveClinicValue(tampered, COOKIE_SECRET)).toBeNull();
    expect(resolveClinicSelection(clinics, null).kind).toBe("selection_required");
  });

  it("membership removida invalida o cookie na requisição seguinte", async () => {
    const cookieClinicId = verifyActiveClinicValue(signActiveClinicValue(clinicA, COOKIE_SECRET), COOKIE_SECRET);
    expect((await activeChoices(removed)).map((clinic) => clinic.id)).toContain(clinicA);
    await pool.query("delete from public.clinic_members where clinic_id = $1 and user_id = $2", [clinicA, removed.id]);
    expect(resolveClinicSelection(await activeChoices(removed), cookieClinicId)).toEqual({ kind: "empty" });
  });

  it("membership suspensa invalida o cookie na requisição seguinte", async () => {
    const cookieClinicId = verifyActiveClinicValue(signActiveClinicValue(clinicA, COOKIE_SECRET), COOKIE_SECRET);
    expect((await activeChoices(suspended)).map((clinic) => clinic.id)).toContain(clinicA);
    await pool.query("update public.clinic_members set status = 'suspended' where clinic_id = $1 and user_id = $2", [clinicA, suspended.id]);
    expect(resolveClinicSelection(await activeChoices(suspended), cookieClinicId)).toEqual({ kind: "empty" });
  });

  it("mantém MFA obrigatório para owner e dispensável para viewer", async () => {
    const ownerRequirement = await ownerA.client.rpc("current_user_requires_mfa");
    const viewerRequirement = await single.client.rpc("current_user_requires_mfa");
    expect(ownerRequirement.error).toBeNull();
    expect(ownerRequirement.data).toBe(true);
    expect(viewerRequirement.error).toBeNull();
    expect(viewerRequirement.data).toBe(false);
  });
});
