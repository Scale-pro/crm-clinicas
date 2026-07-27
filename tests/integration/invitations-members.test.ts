import { createHash } from "node:crypto";
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
const userIds: string[] = [];
let clinicId: string;
let owner: Awaited<ReturnType<typeof createUser>>;
let adminUser: Awaited<ReturnType<typeof createUser>>;
let manager: Awaited<ReturnType<typeof createUser>>;
let invitee: Awaited<ReturnType<typeof createUser>>;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

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
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  if (aal2) {
    const enrolled = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Teste ${label}`,
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
  return { client, email, id: created.data.user.id };
}

beforeAll(async () => {
  [owner, adminUser, manager, invitee] = await Promise.all([
    createUser("owner", true),
    createUser("admin", true),
    createUser("manager", true),
    createUser("invitee"),
  ]);
  const clinic = await pool.query<{ id: string }>(
    `insert into public.clinics (name, slug, timezone, created_by)
     values ('Clínica Convites Fictícia', $1, 'America/Sao_Paulo', $2)
     returning id`,
    [`invites-${crypto.randomUUID()}`, owner.id],
  );
  clinicId = clinic.rows[0]!.id;
  await pool.query(
    `insert into public.clinic_members (clinic_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'admin'), ($1, $4, 'manager')`,
    [clinicId, owner.id, adminUser.id, manager.id],
  );
});

afterAll(async () => {
  await pool.query("delete from public.audit_logs where clinic_id = $1", [clinicId]);
  await pool.query("delete from public.clinics where id = $1", [clinicId]);
  for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  await pool.end();
});

async function rpcInvite(
  actor: typeof owner,
  role: string,
  email = `target-${crypto.randomUUID()}@example.test`,
) {
  return actor.client.rpc("invite_member", {
    clinic_id: clinicId,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    member_email: email,
    member_role: role,
    token_hash: hash(crypto.randomUUID()),
  });
}

describe("matriz de convites", () => {
  it("owner convida admin, mas admin não convida admin", async () => {
    expect((await rpcInvite(owner, "admin")).error).toBeNull();
    expect((await rpcInvite(adminUser, "admin")).error).not.toBeNull();
  });

  it("manager convida papéis inferiores, nunca manager/admin/owner", async () => {
    expect((await rpcInvite(manager, "viewer")).error).toBeNull();
    for (const role of ["manager", "admin", "owner"]) {
      expect((await rpcInvite(manager, role)).error).not.toBeNull();
    }
  });

  it("manager não usa convite para rebaixar o único owner", async () => {
    const before = await pool.query<{ role: string; status: string }>(
      `select role, status from public.clinic_members
       where clinic_id = $1 and user_id = $2`,
      [clinicId, owner.id],
    );
    expect((await rpcInvite(manager, "viewer", owner.email)).error).not.toBeNull();
    const after = await pool.query<{ role: string; status: string }>(
      `select role, status from public.clinic_members
       where clinic_id = $1 and user_id = $2`,
      [clinicId, owner.id],
    );
    expect(after.rows).toEqual(before.rows);
    expect(after.rowCount).toBe(1);
    const pending = await pool.query<{ count: string }>(
      `select count(*) from public.invitations
       where clinic_id = $1 and email = $2 and status = 'pending'`,
      [clinicId, owner.email],
    );
    expect(pending.rows).toEqual([{ count: "0" }]);
  });

  it("não recria convite para membership ativa ou suspensa", async () => {
    expect((await rpcInvite(manager, "viewer", adminUser.email)).error).not.toBeNull();

    const suspended = await createUser("already-suspended");
    await pool.query(
      `insert into public.clinic_members (clinic_id, user_id, role, status)
       values ($1, $2, 'professional', 'suspended')`,
      [clinicId, suspended.id],
    );
    expect((await rpcInvite(manager, "viewer", suspended.email)).error).not.toBeNull();

    const pending = await pool.query<{ count: string }>(
      `select count(*) from public.invitations
       where clinic_id = $1 and email = any($2::text[]) and status = 'pending'`,
      [clinicId, [adminUser.email, suspended.email]],
    );
    expect(pending.rows).toEqual([{ count: "0" }]);
  });

  it("manager sem AAL2 é bloqueado mesmo com member.invite", async () => {
    const aal1Manager = await createUser("manager-aal1");
    await pool.query(
      `insert into public.clinic_members (clinic_id, user_id, role)
       values ($1, $2, 'manager')`,
      [clinicId, aal1Manager.id],
    );
    expect((await rpcInvite(aal1Manager, "viewer")).error).not.toBeNull();
  });

  it("admin precisa de AAL2 para convidar mesmo quando o papel é atribuível", async () => {
    expect((await rpcInvite(adminUser, "viewer")).error).toBeNull();

    const aal1Admin = await createUser("admin-aal1");
    await pool.query(
      `insert into public.clinic_members (clinic_id, user_id, role)
       values ($1, $2, 'admin')`,
      [clinicId, aal1Admin.id],
    );
    expect((await rpcInvite(aal1Admin, "viewer")).error).not.toBeNull();
  });
});

describe("aceite atômico e genérico", () => {
  async function insertInvitation(
    token: string,
    options: { email?: string; expires?: Date; status?: string; role?: string } = {},
  ) {
    await pool.query(
      `insert into public.invitations (
         clinic_id, email, role, token_hash, expires_at, status, invited_by, created_at
       ) values ($1, $2, $3, $4, $5, $6, $7, statement_timestamp() - interval '2 hours')`,
      [
        clinicId,
        options.email ?? invitee.email,
        options.role ?? "viewer",
        hash(token),
        options.expires ?? new Date(Date.now() + 3_600_000),
        options.status ?? "pending",
        owner.id,
      ],
    );
  }

  it("recusa expirado, revogado, usado, owner e e-mail divergente", async () => {
    const cases = [
      { token: `expired-${crypto.randomUUID()}`, options: { expires: new Date(Date.now() - 1000) } },
      { token: `revoked-${crypto.randomUUID()}`, options: { status: "revoked" } },
      { token: `used-${crypto.randomUUID()}`, options: { status: "accepted" } },
      { token: `owner-${crypto.randomUUID()}`, options: { role: "owner" } },
      {
        token: `mismatch-${crypto.randomUUID()}`,
        options: { email: `other-${crypto.randomUUID()}@example.test` },
      },
    ];
    for (const item of cases) {
      await insertInvitation(item.token, item.options);
      const result = await invitee.client.rpc("accept_invitation", {
        token_hash: hash(item.token),
      });
      expect(result.error).not.toBeNull();
      await pool.query("delete from public.invitations where token_hash = $1", [
        hash(item.token),
      ]);
    }
  });

  it("convite antigo não altera owner existente", async () => {
    const token = `existing-owner-${crypto.randomUUID()}`;
    await insertInvitation(token, { email: owner.email, role: "viewer" });
    expect(
      (
        await owner.client.rpc("accept_invitation", {
          token_hash: hash(token),
        })
      ).error,
    ).not.toBeNull();
    const membership = await pool.query<{ role: string; status: string }>(
      `select role, status from public.clinic_members
       where clinic_id = $1 and user_id = $2`,
      [clinicId, owner.id],
    );
    expect(membership.rows).toEqual([{ role: "owner", status: "active" }]);
  });

  it("convite antigo não reativa membership suspensa", async () => {
    const suspended = await createUser("accept-suspended");
    const token = `existing-suspended-${crypto.randomUUID()}`;
    await insertInvitation(token, { email: suspended.email, role: "viewer" });
    await pool.query(
      `insert into public.clinic_members (clinic_id, user_id, role, status)
       values ($1, $2, 'professional', 'suspended')`,
      [clinicId, suspended.id],
    );
    expect(
      (
        await suspended.client.rpc("accept_invitation", {
          token_hash: hash(token),
        })
      ).error,
    ).not.toBeNull();
    const membership = await pool.query<{ role: string; status: string }>(
      `select role, status from public.clinic_members
       where clinic_id = $1 and user_id = $2`,
      [clinicId, suspended.id],
    );
    expect(membership.rows).toEqual([{ role: "professional", status: "suspended" }]);
  });

  it("aceita uma vez, usa papel da linha e impede replay", async () => {
    const token = `valid-${crypto.randomUUID()}`;
    await insertInvitation(token, { role: "professional" });
    const accepted = await invitee.client.rpc("accept_invitation", {
      token_hash: hash(token),
    });
    expect(accepted.error).toBeNull();
    expect(accepted.data).toBe(clinicId);

    const membership = await pool.query<{ role: string }>(
      "select role from public.clinic_members where clinic_id = $1 and user_id = $2",
      [clinicId, invitee.id],
    );
    expect(membership.rows).toEqual([{ role: "professional" }]);
    expect(
      (
        await invitee.client.rpc("accept_invitation", {
          token_hash: hash(token),
        })
      ).error,
    ).not.toBeNull();
  });

  it("duplo-submit concorrente cria uma única membership", async () => {
    const concurrentInvitee = await createUser("concurrent-invitee");
    const token = `concurrent-${crypto.randomUUID()}`;
    await insertInvitation(token, {
      email: concurrentInvitee.email,
      role: "viewer",
    });

    const attempts = await Promise.all([
      concurrentInvitee.client.rpc("accept_invitation", {
        token_hash: hash(token),
      }),
      concurrentInvitee.client.rpc("accept_invitation", {
        token_hash: hash(token),
      }),
    ]);
    expect(attempts.filter((attempt) => attempt.error === null)).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.error !== null)).toHaveLength(1);

    const state = await pool.query<{ memberships: string; status: string }>(
      `select i.status,
              (select count(*) from public.clinic_members cm
               where cm.clinic_id = i.clinic_id and cm.user_id = $2) as memberships
       from public.invitations i
       where i.token_hash = $1`,
      [hash(token), concurrentInvitee.id],
    );
    expect(state.rows).toEqual([{ memberships: "1", status: "accepted" }]);
  });

  it("e-mail não confirmado é recusado pelo estado real do Auth", async () => {
    const user = await createUser("unconfirmed-after-login");
    const token = `unconfirmed-${crypto.randomUUID()}`;
    await insertInvitation(token, { email: user.email });
    await pool.query(
      "update auth.users set email_confirmed_at = null where id = $1",
      [user.id],
    );
    expect(
      (
        await user.client.rpc("accept_invitation", {
          token_hash: hash(token),
        })
      ).error,
    ).not.toBeNull();
  });
});

describe("último owner", () => {
  it("não pode ser rebaixado, suspenso ou removido", async () => {
    const membership = await pool.query<{ id: string }>(
      `select id from public.clinic_members
       where clinic_id = $1 and user_id = $2`,
      [clinicId, owner.id],
    );
    const memberId = membership.rows[0]!.id;
    expect(
      (
        await owner.client.rpc("update_member_role", {
          clinic_id: clinicId,
          member_id: memberId,
          target_role: "admin",
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await owner.client.rpc("suspend_member", {
          clinic_id: clinicId,
          member_id: memberId,
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await owner.client.rpc("remove_member", {
          clinic_id: clinicId,
          member_id: memberId,
        })
      ).error,
    ).not.toBeNull();
  });

  it("serializa remoções concorrentes e preserva um owner ativo", async () => {
    const [firstOwner, secondOwner] = await Promise.all([
      createUser("concurrent-owner-a", true),
      createUser("concurrent-owner-b", true),
    ]);
    const clinic = await pool.query<{ id: string }>(
      `insert into public.clinics (name, slug, timezone, created_by)
       values ('Clínica Owners Concorrentes', $1, 'America/Sao_Paulo', $2)
       returning id`,
      [`concurrent-owners-${crypto.randomUUID()}`, firstOwner.id],
    );
    const concurrentClinicId = clinic.rows[0]!.id;

    try {
      const memberships = await pool.query<{ id: string; user_id: string }>(
        `insert into public.clinic_members (clinic_id, user_id, role)
         values ($1, $2, 'owner'), ($1, $3, 'owner')
         returning id, user_id`,
        [concurrentClinicId, firstOwner.id, secondOwner.id],
      );
      const firstMembership = memberships.rows.find(
        (membership) => membership.user_id === firstOwner.id,
      )!;
      const secondMembership = memberships.rows.find(
        (membership) => membership.user_id === secondOwner.id,
      )!;

      const attempts = await Promise.all([
        firstOwner.client.rpc("remove_member", {
          clinic_id: concurrentClinicId,
          member_id: secondMembership.id,
        }),
        secondOwner.client.rpc("remove_member", {
          clinic_id: concurrentClinicId,
          member_id: firstMembership.id,
        }),
      ]);
      expect(attempts.filter((attempt) => attempt.error === null)).toHaveLength(1);
      expect(attempts.filter((attempt) => attempt.error !== null)).toHaveLength(1);

      const owners = await pool.query<{ count: string }>(
        `select count(*) from public.clinic_members
         where clinic_id = $1 and role = 'owner' and status = 'active'`,
        [concurrentClinicId],
      );
      expect(owners.rows).toEqual([{ count: "1" }]);
    } finally {
      await pool.query("delete from public.audit_logs where clinic_id = $1", [
        concurrentClinicId,
      ]);
      await pool.query("delete from public.clinics where id = $1", [
        concurrentClinicId,
      ]);
    }
  });
});
