import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAdminClient,
  createTestUserClient,
} from "./helpers/create-test-admin-client";
import { createTestDbPool } from "./helpers/create-test-db-client";

const PASSWORD = "Local-only-test-password-123!";
const pool = createTestDbPool();
const admin = createTestAdminClient();

type FixtureUser = {
  client: ReturnType<typeof createTestUserClient>;
  email: string;
  id: string;
};

const users: FixtureUser[] = [];
const clinicIds: string[] = [];
let clinicA: string;
let clinicB: string;
let ownerA: FixtureUser;
let ownerB: FixtureUser;
let viewerA: FixtureUser;

async function createUser(label: string): Promise<FixtureUser> {
  const email = `${label}-${crypto.randomUUID()}@example.test`;
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: PASSWORD,
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("Auth local não retornou usuário.");
  }

  const client = createTestUserClient();
  const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;

  const user = { client, email, id: created.data.user.id };
  users.push(user);
  return user;
}

beforeAll(async () => {
  [ownerA, ownerB, viewerA] = await Promise.all([
    createUser("owner-a"),
    createUser("owner-b"),
    createUser("viewer-a"),
  ]);

  const clinics = await pool.query<{ id: string; name: string }>(
    `insert into public.clinics (name, slug, timezone, created_by)
     values
       ('Clínica Fictícia A', $1, 'America/Sao_Paulo', $3),
       ('Clínica Fictícia B', $2, 'America/Sao_Paulo', $4)
     returning id, name`,
    [
      `clinic-a-${crypto.randomUUID()}`,
      `clinic-b-${crypto.randomUUID()}`,
      ownerA.id,
      ownerB.id,
    ],
  );
  clinicA = clinics.rows.find((clinic) => clinic.name.endsWith("A"))!.id;
  clinicB = clinics.rows.find((clinic) => clinic.name.endsWith("B"))!.id;
  clinicIds.push(clinicA, clinicB);

  await pool.query(
    `insert into public.clinic_members (clinic_id, user_id, role)
     values ($1, $3, 'owner'), ($2, $4, 'owner'), ($1, $5, 'viewer')`,
    [clinicA, clinicB, ownerA.id, ownerB.id, viewerA.id],
  );
  await pool.query(
    `insert into public.clinic_features (clinic_id, feature_key, enabled)
     values ($1, 'fixture_a', true), ($2, 'fixture_b', true)`,
    [clinicA, clinicB],
  );
  await pool.query(
    `insert into public.clinic_limits (clinic_id, limit_key, limit_value)
     values ($1, 'fixture_limit', 10), ($2, 'fixture_limit', 20)`,
    [clinicA, clinicB],
  );
});

afterAll(async () => {
  if (clinicIds.length > 0) {
    await pool.query("delete from public.clinics where id = any($1::uuid[])", [
      clinicIds,
    ]);
  }
  for (const user of users) {
    await admin.auth.admin.deleteUser(user.id);
  }
  await pool.end();
});

describe("isolamento real entre clínicas", () => {
  it("usuário da clínica A não lê dados da clínica B", async () => {
    const own = await ownerA.client
      .from("clinic_features")
      .select("clinic_id,feature_key")
      .eq("clinic_id", clinicA);
    const foreign = await ownerA.client
      .from("clinic_features")
      .select("clinic_id,feature_key")
      .eq("clinic_id", clinicB);

    expect(own.error).toBeNull();
    expect(own.data).toEqual([{ clinic_id: clinicA, feature_key: "fixture_a" }]);
    expect(foreign.error).toBeNull();
    expect(foreign.data).toEqual([]);
  });

  it("usuário da clínica B não lê dados da clínica A", async () => {
    const own = await ownerB.client
      .from("clinic_limits")
      .select("clinic_id,limit_key,limit_value")
      .eq("clinic_id", clinicB);
    const foreign = await ownerB.client
      .from("clinic_limits")
      .select("clinic_id,limit_key,limit_value")
      .eq("clinic_id", clinicA);

    expect(own.error).toBeNull();
    expect(own.data).toEqual([
      { clinic_id: clinicB, limit_key: "fixture_limit", limit_value: 20 },
    ]);
    expect(foreign.error).toBeNull();
    expect(foreign.data).toEqual([]);
  });

  it("bloqueia inserção cross-tenant e escrita direta até no próprio tenant", async () => {
    const crossTenant = await ownerA.client.from("clinic_features").insert({
      clinic_id: clinicB,
      enabled: true,
      feature_key: "forbidden_cross_tenant",
    });
    const ownTenant = await ownerA.client.from("clinic_features").insert({
      clinic_id: clinicA,
      enabled: true,
      feature_key: "forbidden_direct_write",
    });

    expect(crossTenant.error).not.toBeNull();
    expect(ownTenant.error).not.toBeNull();
  });

  it("impede alteração maliciosa de clinic_id", async () => {
    const result = await ownerA.client
      .from("clinic_features")
      .update({ clinic_id: clinicB })
      .eq("clinic_id", clinicA)
      .eq("feature_key", "fixture_a");

    expect(result.error).not.toBeNull();
    const persisted = await pool.query<{ clinic_id: string }>(
      "select clinic_id from public.clinic_features where feature_key = 'fixture_a'",
    );
    expect(persisted.rows).toEqual([{ clinic_id: clinicA }]);
  });

  it("papel sem permissão específica é bloqueado", async () => {
    const viewerPermission = await viewerA.client.rpc(
      "current_user_has_permission",
      {
        clinic_id: clinicA,
        permission_key: "member.invite",
      },
    );
    const ownerPermission = await ownerA.client.rpc("current_user_has_permission", {
      clinic_id: clinicA,
      permission_key: "member.invite",
    });

    expect(viewerPermission.error).toBeNull();
    expect(viewerPermission.data).toBe(false);
    expect(ownerPermission.error).toBeNull();
    expect(ownerPermission.data).toBe(true);
  });

  it("wrappers derivam auth.uid e não enumeram clínicas de terceiros", async () => {
    const clinicsA = await ownerA.client.rpc("current_user_clinic_ids");
    const clinicsB = await ownerB.client.rpc("current_user_clinic_ids");
    const foreignPermission = await ownerA.client.rpc(
      "current_user_has_permission",
      {
        clinic_id: clinicB,
        permission_key: "member.invite",
      },
    );

    expect(clinicsA.error).toBeNull();
    expect(clinicsA.data).toEqual([clinicA]);
    expect(clinicsB.error).toBeNull();
    expect(clinicsB.data).toEqual([clinicB]);
    expect(foreignPermission.error).toBeNull();
    expect(foreignPermission.data).toBe(false);
  });

  it("SECURITY DEFINER sob FORCE RLS não eleva privilégio", async () => {
    const platformAdmin = await ownerA.client.rpc(
      "current_user_is_platform_admin",
    );
    const clinics = await ownerA.client.rpc("current_user_clinic_ids");

    expect(platformAdmin.error).toBeNull();
    expect(platformAdmin.data).toBe(false);
    expect(clinics.error).toBeNull();
    expect(clinics.data).not.toContain(clinicB);
  });

  it("membership removido revoga acesso na requisição seguinte com o mesmo JWT", async () => {
    const before = await viewerA.client
      .from("clinic_features")
      .select("feature_key")
      .eq("clinic_id", clinicA);
    expect(before.data).toEqual([{ feature_key: "fixture_a" }]);

    await pool.query(
      `update public.clinic_members
       set status = 'suspended'
       where clinic_id = $1 and user_id = $2`,
      [clinicA, viewerA.id],
    );

    const after = await viewerA.client
      .from("clinic_features")
      .select("feature_key")
      .eq("clinic_id", clinicA);
    expect(after.error).toBeNull();
    expect(after.data).toEqual([]);
  });
});
