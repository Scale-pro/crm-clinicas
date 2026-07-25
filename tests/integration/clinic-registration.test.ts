import { afterAll, describe, expect, it } from "vitest";

import {
  createTestAdminClient,
  createTestUserClient,
} from "./helpers/create-test-admin-client";
import { createTestDbPool } from "./helpers/create-test-db-client";

const admin = createTestAdminClient();
const pool = createTestDbPool();
const userIds: string[] = [];
const clinicIds: string[] = [];

async function authenticatedUser() {
  const email = `onboarding-${crypto.randomUUID()}@example.test`;
  const password = "Local-only-test-password-123!";
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("Auth local não criou usuário.");
  }
  userIds.push(created.data.user.id);

  const client = createTestUserClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { client, userId: created.data.user.id };
}

afterAll(async () => {
  if (clinicIds.length > 0) {
    await pool.query("delete from public.audit_logs where clinic_id = any($1::uuid[])", [
      clinicIds,
    ]);
    await pool.query("delete from public.clinics where id = any($1::uuid[])", [
      clinicIds,
    ]);
  }
  for (const userId of userIds) {
    await admin.auth.admin.deleteUser(userId);
  }
  await pool.end();
});

describe("create_clinic_with_owner", () => {
  it("cria atomicamente clínica, owner, defaults, activity e auditoria", async () => {
    const { client, userId } = await authenticatedUser();
    const slug = `atomic-${crypto.randomUUID()}`;
    const created = await client.rpc("create_clinic_with_owner", {
      clinic_name: "Clínica Atômica Fictícia",
      clinic_slug: slug,
      clinic_timezone: "America/Sao_Paulo",
    });
    expect(created.error).toBeNull();
    expect(created.data).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    clinicIds.push(created.data!);

    const snapshot = await pool.query<{
      activities: string;
      audits: string;
      features: string;
      limits: string;
      owners: string;
    }>(
      `select
         (select count(*) from public.clinic_members
          where clinic_id = $1 and user_id = $2 and role = 'owner' and status = 'active') as owners,
         (select count(*) from public.clinic_features where clinic_id = $1) as features,
         (select count(*) from public.clinic_limits where clinic_id = $1) as limits,
         (select count(*) from public.activities
          where clinic_id = $1 and actor_id = $2 and type = 'clinic.created') as activities,
         (select count(*) from public.audit_logs
          where clinic_id = $1 and actor_id = $2 and action = 'clinic.created'
            and entity = 'clinic' and entity_id = $1 and via = 'user') as audits`,
      [created.data, userId],
    );
    expect(snapshot.rows).toEqual([
      { activities: "1", audits: "1", features: "2", limits: "2", owners: "1" },
    ]);
  });

  it("cadastro repetido retorna a mesma clínica sem duplicar efeitos", async () => {
    const { client, userId } = await authenticatedUser();
    const first = await client.rpc("create_clinic_with_owner", {
      clinic_name: "Clínica Idempotente Fictícia",
      clinic_slug: `idempotent-${crypto.randomUUID()}`,
      clinic_timezone: "America/Sao_Paulo",
    });
    expect(first.error).toBeNull();
    clinicIds.push(first.data!);

    const second = await client.rpc("create_clinic_with_owner", {
      clinic_name: "Nome Ignorado no Replay",
      clinic_slug: `replay-${crypto.randomUUID()}`,
      clinic_timezone: "Europe/Lisbon",
    });
    expect(second.error).toBeNull();
    expect(second.data).toBe(first.data);

    const counts = await pool.query<{ audits: string; clinics: string }>(
      `select
         (select count(*) from public.clinics
          where created_by = $1 and deleted_at is null) as clinics,
         (select count(*) from public.audit_logs
          where clinic_id = $2 and action = 'clinic.created') as audits`,
      [userId, first.data],
    );
    expect(counts.rows).toEqual([{ audits: "1", clinics: "1" }]);
  });

  it("chamadas concorrentes não criam clínicas duplicadas", async () => {
    const { client, userId } = await authenticatedUser();
    const slug = `concurrent-${crypto.randomUUID()}`;
    const calls = await Promise.all(
      Array.from({ length: 6 }, () =>
        client.rpc("create_clinic_with_owner", {
          clinic_name: "Clínica Concorrente Fictícia",
          clinic_slug: slug,
          clinic_timezone: "America/Sao_Paulo",
        }),
      ),
    );

    expect(calls.every((call) => call.error === null)).toBe(true);
    expect(new Set(calls.map((call) => call.data)).size).toBe(1);
    clinicIds.push(calls[0]!.data!);

    const count = await pool.query<{ count: string }>(
      "select count(*) from public.clinics where created_by = $1",
      [userId],
    );
    expect(count.rows).toEqual([{ count: "1" }]);
  });

  it("dados inválidos não deixam estado parcial", async () => {
    const { client, userId } = await authenticatedUser();
    const invalid = await client.rpc("create_clinic_with_owner", {
      clinic_name: "Clínica Inválida Fictícia",
      clinic_slug: `invalid-${crypto.randomUUID()}`,
      clinic_timezone: "Invalid/Timezone",
    });
    expect(invalid.error).not.toBeNull();

    const count = await pool.query<{ count: string }>(
      "select count(*) from public.clinics where created_by = $1",
      [userId],
    );
    expect(count.rows).toEqual([{ count: "0" }]);
  });
});
