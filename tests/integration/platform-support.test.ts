import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAdminClient,
  createTestUserClient,
} from "./helpers/create-test-admin-client";
import { createTestDbPool } from "./helpers/create-test-db-client";
import { currentTotp } from "./helpers/totp";

const admin = createTestAdminClient();
const pool = createTestDbPool();
const password = "Local-only-test-password-123!";
const reason = "Diagnóstico autorizado para teste isolado da clínica";
const userIds: string[] = [];
let clinicA: string;
let clinicB: string;
let owner: Awaited<ReturnType<typeof createUser>>;
let ownerB: Awaited<ReturnType<typeof createUser>>;
let platformAdmin: Awaited<ReturnType<typeof createUser>>;
let platformAdminAal1: Awaited<ReturnType<typeof createUser>>;
let ordinaryUser: Awaited<ReturnType<typeof createUser>>;

async function createUser(label: string, aal2 = false) {
  const email = `${label}-${crypto.randomUUID()}@example.test`;
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });
  if (created.error || !created.data.user) throw created.error;
  userIds.push(created.data.user.id);

  const client = createTestUserClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  if (aal2) {
    const enrolled = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Suporte ${label}`,
    });
    if (enrolled.error || !enrolled.data || !("totp" in enrolled.data)) {
      throw enrolled.error;
    }
    const verified = await client.auth.mfa.challengeAndVerify({
      factorId: enrolled.data.id,
      code: currentTotp(enrolled.data.totp.secret),
    });
    if (verified.error) throw verified.error;
  }
  return { client, id: created.data.user.id };
}

async function createGrant() {
  const result = await platformAdmin.client.rpc("create_support_grant", {
    access_level: "read_only",
    clinic_id: clinicA,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    reason,
  });
  if (result.error || !result.data) throw result.error;
  return result.data as string;
}

beforeAll(async () => {
  [owner, ownerB, platformAdmin, platformAdminAal1, ordinaryUser] = await Promise.all([
    createUser("support-owner"),
    createUser("support-owner-b"),
    createUser("platform-aal2", true),
    createUser("platform-aal1"),
    createUser("ordinary-user"),
  ]);

  const clinics = await pool.query<{ id: string }>(
    `insert into public.clinics (name, slug, timezone, created_by)
     values
       ('Clínica Suporte A', $1, 'America/Sao_Paulo', $3),
       ('Clínica Suporte B', $2, 'America/Sao_Paulo', $4)
     returning id`,
    [
      `support-a-${crypto.randomUUID()}`,
      `support-b-${crypto.randomUUID()}`,
      owner.id,
      ownerB.id,
    ],
  );
  clinicA = clinics.rows[0]!.id;
  clinicB = clinics.rows[1]!.id;

  await pool.query(
    `insert into public.platform_admins (user_id, created_by)
     values ($1, $3), ($2, $3)`,
    [platformAdmin.id, platformAdminAal1.id, owner.id],
  );
  await pool.query(
    `insert into public.clinic_members (clinic_id, user_id, role)
     values ($1, $2, 'owner')`,
    [clinicA, owner.id],
  );
  await pool.query(
    `insert into public.invitations (
       clinic_id, email, role, token_hash, expires_at, invited_by
     ) values ($1, 'support-target@example.test', 'viewer', $2,
       statement_timestamp() + interval '1 hour', $3)`,
    [clinicA, crypto.randomUUID().replaceAll("-", "").repeat(2), owner.id],
  );
  await pool.query(
    `insert into public.clinic_features (clinic_id, feature_key, enabled, config)
     values ($1, 'support_feature', true, '{"source":"fixture"}')`,
    [clinicA],
  );
  await pool.query(
    `insert into public.clinic_limits (clinic_id, limit_key, limit_value)
     values ($1, 'support_limit', 25)`,
    [clinicA],
  );
});

afterAll(async () => {
  if (userIds.length > 0) {
    await pool.query("delete from public.audit_logs where actor_id = any($1::uuid[])", [
      userIds,
    ]);
  }
  if (clinicA) {
    await pool.query("delete from public.audit_logs where clinic_id = any($1::uuid[])", [
      [clinicA, clinicB],
    ]);
    await pool.query("delete from public.support_grants where clinic_id = any($1::uuid[])", [
      [clinicA, clinicB],
    ]);
  }
  for (const userId of userIds) {
    await pool.query("delete from public.platform_admins where user_id = $1", [userId]);
  }
  if (clinicA) {
    await pool.query("delete from public.clinics where id = any($1::uuid[])", [
      [clinicA, clinicB],
    ]);
  }
  for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  await pool.end();
});

describe("acesso de suporte isolado", () => {
  it("recusa clinic owner e usuário comum fora da plataforma", async () => {
    expect((await owner.client.rpc("platform_list_clinics")).error).not.toBeNull();
    expect((await ordinaryUser.client.rpc("platform_list_clinics")).error)
      .not.toBeNull();
  });

  it("lista apenas metadados da plataforma e bloqueia leitura clínica sem grant", async () => {
    const listed = await platformAdmin.client.rpc("platform_list_clinics");
    expect(listed.error).toBeNull();
    const clinic = (listed.data as Record<string, unknown>[]).find(
      (row) => row.clinic_id === clinicA,
    );
    expect(Object.keys(clinic ?? {}).sort()).toEqual(
      ["clinic_id", "created_at", "name", "slug", "status", "timezone"].sort(),
    );

    const direct = await platformAdmin.client
      .from("clinic_members")
      .select("id,user_id,role,status,created_at")
      .eq("clinic_id", clinicA);
    expect(direct.error).toBeNull();
    expect(direct.data).toEqual([]);
    expect(
      (
        await platformAdmin.client.rpc("platform_read_clinic_members", {
          clinic_id: clinicA,
          grant_id: crypto.randomUUID(),
        })
      ).error,
    ).not.toBeNull();
  });

  it("cria exclusivamente read_only e exige AAL2 nas RPCs sensíveis", async () => {
    for (const accessLevel of ["support_operations", "restricted_write"]) {
      const rejected = await platformAdmin.client.rpc("create_support_grant", {
        access_level: accessLevel,
        clinic_id: clinicA,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        reason,
      });
      expect(rejected.error).not.toBeNull();
    }

    const aal1Create = await platformAdminAal1.client.rpc("create_support_grant", {
      access_level: "read_only",
      clinic_id: clinicA,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      reason,
    });
    expect(aal1Create.error).not.toBeNull();
    expect((await platformAdminAal1.client.rpc("platform_list_clinics")).error)
      .not.toBeNull();

    const aal1Grant = await pool.query<{ id: string }>(
      `insert into public.support_grants (
         admin_user_id, clinic_id, access_level, reason, expires_at
       ) values ($1, $2, 'read_only', $3, statement_timestamp() + interval '1 hour')
       returning id`,
      [platformAdminAal1.id, clinicA, reason],
    );
    expect(
      (
        await platformAdminAal1.client.rpc("platform_read_clinic_members", {
          clinic_id: clinicA,
          grant_id: aal1Grant.rows[0]!.id,
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await platformAdminAal1.client.rpc("revoke_support_grant", {
          grant_id: aal1Grant.rows[0]!.id,
        })
      ).error,
    ).not.toBeNull();
  });

  it("expõe somente as quatro leituras allowlisted e audita cada uma", async () => {
    const grantId = await createGrant();
    const calls = [
      {
        keys: ["created_at", "member_id", "role", "status", "user_id"],
        result: await platformAdmin.client.rpc("platform_read_clinic_members", {
          clinic_id: clinicA,
          grant_id: grantId,
        }),
      },
      {
        keys: ["created_at", "email", "expires_at", "invitation_id", "role", "status"],
        result: await platformAdmin.client.rpc("platform_read_clinic_invitations", {
          clinic_id: clinicA,
          grant_id: grantId,
        }),
      },
      {
        keys: ["config", "enabled", "key", "kind", "limit_value"],
        result: await platformAdmin.client.rpc("platform_read_clinic_configuration", {
          clinic_id: clinicA,
          grant_id: grantId,
        }),
      },
      {
        keys: ["action", "actor_id", "audit_id", "entity", "entity_id", "occurred_at", "via"],
        result: await platformAdmin.client.rpc("platform_read_clinic_audit", {
          clinic_id: clinicA,
          grant_id: grantId,
        }),
      },
    ];

    for (const call of calls) {
      expect(call.result.error).toBeNull();
      expect(call.result.data?.length).toBeGreaterThan(0);
      for (const row of call.result.data as Record<string, unknown>[]) {
        expect(Object.keys(row).sort()).toEqual([...call.keys].sort());
      }
    }

    const logs = await pool.query<{
      access_level: string;
      action: string;
      reason: string;
      via: string;
    }>(
      `select action, via, access_level, reason
       from public.audit_logs
       where support_grant_id = $1 and action like 'support.read_%'
       order by action`,
      [grantId],
    );
    expect(logs.rows).toEqual(
      ["audit", "configuration", "invitations", "members"].sort().map((name) => ({
        access_level: "read_only",
        action: `support.read_${name}`,
        reason,
        via: "support",
      })),
    );
  });

  it("não transforma grant read_only em acesso Data API ou escrita", async () => {
    const grantId = await createGrant();
    const directRead = await platformAdmin.client
      .from("clinic_members")
      .select("id")
      .eq("clinic_id", clinicA);
    expect(directRead.error).toBeNull();
    expect(directRead.data).toEqual([]);

    const directWrite = await platformAdmin.client
      .from("clinic_features")
      .update({ enabled: false })
      .eq("clinic_id", clinicA);
    expect(directWrite.error).not.toBeNull();

    expect(
      (
        await platformAdmin.client.rpc("platform_read_clinic_members", {
          clinic_id: clinicB,
          grant_id: grantId,
        })
      ).error,
    ).not.toBeNull();
  });

  it("torna grants revogados, expirados e de admin removido imediatamente inertes", async () => {
    const revokedGrant = await createGrant();
    const revoked = await platformAdmin.client.rpc("revoke_support_grant", {
      grant_id: revokedGrant,
    });
    expect(revoked.error).toBeNull();
    expect(revoked.data).toBe(true);
    expect(
      (
        await platformAdmin.client.rpc("platform_read_clinic_members", {
          clinic_id: clinicA,
          grant_id: revokedGrant,
        })
      ).error,
    ).not.toBeNull();

    const expired = await pool.query<{ id: string }>(
      `insert into public.support_grants (
         admin_user_id, clinic_id, access_level, reason, created_at, expires_at
       ) values ($1, $2, 'read_only', $3,
         statement_timestamp() - interval '2 hours',
         statement_timestamp() - interval '1 hour')
       returning id`,
      [platformAdmin.id, clinicA, reason],
    );
    expect(
      (
        await platformAdmin.client.rpc("platform_read_clinic_members", {
          clinic_id: clinicA,
          grant_id: expired.rows[0]!.id,
        })
      ).error,
    ).not.toBeNull();

    const orphaned = await createGrant();
    await pool.query("delete from public.platform_admins where user_id = $1", [
      platformAdmin.id,
    ]);
    expect(
      (
        await platformAdmin.client.rpc("platform_read_clinic_members", {
          clinic_id: clinicA,
          grant_id: orphaned,
        })
      ).error,
    ).not.toBeNull();
    await pool.query(
      "insert into public.platform_admins (user_id, created_by) values ($1, $2)",
      [platformAdmin.id, owner.id],
    );
  });

  it("preserva a ordem nativa do enum, sem comparação lexical", async () => {
    const { rows } = await pool.query<{
      native_order: boolean;
      text_order: boolean;
    }>(
      `select
         'restricted_write'::public.support_access_level >
           'support_operations'::public.support_access_level as native_order,
         'restricted_write'::text > 'support_operations'::text as text_order`,
    );
    expect(rows).toEqual([{ native_order: true, text_order: false }]);
  });
});
