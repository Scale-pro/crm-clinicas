import { afterAll, describe, expect, it } from "vitest";

import {
  createTestAdminClient,
  createTestUserClient,
} from "./helpers/create-test-admin-client";
import { createTestDbPool } from "./helpers/create-test-db-client";
import { currentTotp } from "./helpers/totp";

const admin = createTestAdminClient();
const pool = createTestDbPool();
const userIds: string[] = [];
const clinicIds: string[] = [];

afterAll(async () => {
  if (clinicIds.length > 0) {
    await pool.query("delete from public.audit_logs where clinic_id = any($1::uuid[])", [
      clinicIds,
    ]);
    await pool.query("delete from public.clinics where id = any($1::uuid[])", [
      clinicIds,
    ]);
  }
  for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  await pool.end();
});

describe("MFA TOTP e AAL2 reais", () => {
  it("owner sem fator fica pendente, AAL1 é bloqueado e AAL2 libera a RPC", async () => {
    const email = `mfa-owner-${crypto.randomUUID()}@example.test`;
    const password = "Local-only-test-password-123!";
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });
    expect(created.error).toBeNull();
    userIds.push(created.data.user!.id);

    const client = createTestUserClient();
    const signedIn = await client.auth.signInWithPassword({ email, password });
    expect(signedIn.error).toBeNull();

    const clinic = await client.rpc("create_clinic_with_owner", {
      clinic_name: "Clínica MFA Fictícia",
      clinic_slug: `mfa-${crypto.randomUUID()}`,
      clinic_timezone: "America/Sao_Paulo",
    });
    expect(clinic.error).toBeNull();
    clinicIds.push(clinic.data!);

    const requirement = await client.rpc("current_user_requires_mfa");
    const factorsBefore = await client.auth.mfa.listFactors();
    expect(requirement.data).toBe(true);
    expect(factorsBefore.data?.totp).toEqual([]);

    const blocked = await client.rpc("update_clinic_settings", {
      clinic_id: clinic.data!,
      clinic_name: "Nome Bloqueado",
      clinic_timezone: "America/Sao_Paulo",
    });
    expect(blocked.error).not.toBeNull();

    const enrollment = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Dispositivo de teste",
    });
    expect(enrollment.error).toBeNull();
    expect(enrollment.data && "totp" in enrollment.data).toBe(true);
    if (!enrollment.data || !("totp" in enrollment.data)) {
      throw new Error("Enrollment TOTP local não retornou segredo.");
    }

    const verified = await client.auth.mfa.challengeAndVerify({
      factorId: enrollment.data.id,
      code: currentTotp(enrollment.data.totp.secret),
    });
    expect(verified.error).toBeNull();

    const claims = await client.auth.getClaims();
    expect(claims.data?.claims.aal).toBe("aal2");
    const allowed = await client.rpc("update_clinic_settings", {
      clinic_id: clinic.data!,
      clinic_name: "Clínica MFA Atualizada",
      clinic_timezone: "America/Recife",
    });
    expect(allowed.error).toBeNull();
    expect(allowed.data).toBe(true);

    const audit = await pool.query<{ count: string }>(
      `select count(*) from public.audit_logs
       where clinic_id = $1 and action = 'clinic.settings_updated'`,
      [clinic.data],
    );
    expect(audit.rows).toEqual([{ count: "1" }]);
  });

  it("manager sem AAL2 continua autorizado a navegar e ler", async () => {
    const ownerEmail = `mfa-owner-seed-${crypto.randomUUID()}@example.test`;
    const managerEmail = `mfa-manager-${crypto.randomUUID()}@example.test`;
    const password = "Local-only-test-password-123!";
    const [owner, manager] = await Promise.all([
      admin.auth.admin.createUser({
        email: ownerEmail,
        email_confirm: true,
        password,
      }),
      admin.auth.admin.createUser({
        email: managerEmail,
        email_confirm: true,
        password,
      }),
    ]);
    expect(owner.error).toBeNull();
    expect(manager.error).toBeNull();
    userIds.push(owner.data.user!.id, manager.data.user!.id);

    const slug = `manager-read-${crypto.randomUUID()}`;
    const inserted = await pool.query<{ id: string }>(
      `insert into public.clinics (name, slug, timezone, created_by)
       values ('Clínica Leitura MFA Fictícia', $1, 'America/Sao_Paulo', $2)
       returning id`,
      [slug, owner.data.user!.id],
    );
    const clinicId = inserted.rows[0]!.id;
    clinicIds.push(clinicId);
    await pool.query(
      `insert into public.clinic_members (clinic_id, user_id, role)
       values ($1, $2, 'owner'), ($1, $3, 'manager')`,
      [clinicId, owner.data.user!.id, manager.data.user!.id],
    );

    const client = createTestUserClient();
    await client.auth.signInWithPassword({ email: managerEmail, password });
    const requirement = await client.rpc("current_user_requires_mfa");
    const clinics = await client.rpc("current_user_clinic_ids");
    expect(requirement.data).toBe(false);
    expect(clinics.data).toContain(clinicId);
  });
});
