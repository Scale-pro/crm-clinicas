import { afterAll, describe, expect, it } from "vitest";

import { createTestAdminClient } from "./helpers/create-test-admin-client";
import { createTestDbPool } from "./helpers/create-test-db-client";

const TABLES = [
  "profiles",
  "clinics",
  "clinic_members",
  "roles",
  "permissions",
  "role_permissions",
  "invitations",
  "clinic_features",
  "clinic_limits",
  "platform_admins",
  "support_grants",
  "activities",
  "audit_logs",
] as const;

const pool = createTestDbPool();
afterAll(() => pool.end());

describe("catálogo do schema F1", () => {
  it("contém exatamente as 13 tabelas públicas aprovadas", async () => {
    const { rows } = await pool.query<{ tablename: string }>(
      `select tablename
       from pg_catalog.pg_tables
       where schemaname = 'public'
       order by tablename`,
    );
    expect(rows.map((row) => row.tablename)).toEqual([...TABLES].sort());
  });

  it("mantém ENABLE e FORCE RLS nas 13 tabelas", async () => {
    const { rows } = await pool.query<{
      relname: string;
      relforcerowsecurity: boolean;
      relrowsecurity: boolean;
    }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = any($1::text[])
       order by c.relname`,
      [TABLES],
    );

    expect(rows).toHaveLength(13);
    expect(rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(
      true,
    );
  });

  it("semeia exatamente a matriz de papéis e permissões da F1", async () => {
    const roles = await pool.query<{ key: string }>(
      "select key from public.roles order by key",
    );
    const permissions = await pool.query<{ key: string }>(
      "select key from public.permissions order by key",
    );
    const matrix = await pool.query<{ permission: string; role: string }>(
      "select role, permission from public.role_permissions order by role, permission",
    );

    expect(roles.rows.map((row) => row.key)).toEqual(
      ["admin", "manager", "owner", "professional", "receptionist", "sdr", "viewer"],
    );
    expect(permissions.rows.map((row) => row.key)).toEqual(
      ["audit.view", "clinic.manage", "member.invite", "member.manage", "member.remove"],
    );
    expect(matrix.rows).toHaveLength(10);
  });

  it("cria profile automaticamente após criação no Auth", async () => {
    const admin = createTestAdminClient();
    const email = `profile-${crypto.randomUUID()}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: "Local-only-test-password-123!",
      user_metadata: { full_name: "Usuário Fictício" },
    });
    expect(error).toBeNull();

    try {
      const profile = await pool.query<{ full_name: string }>(
        "select full_name from public.profiles where user_id = $1",
        [data.user?.id],
      );
      expect(profile.rows).toEqual([{ full_name: "Usuário Fictício" }]);
    } finally {
      if (data.user) await admin.auth.admin.deleteUser(data.user.id);
    }
  });

  it("declara o ordenamento nativo correto do enum de suporte", async () => {
    const { rows } = await pool.query<{ enumlabel: string }>(
      `select e.enumlabel
       from pg_catalog.pg_enum e
       join pg_catalog.pg_type t on t.oid = e.enumtypid
       join pg_catalog.pg_namespace n on n.oid = t.typnamespace
       where n.nspname = 'public' and t.typname = 'support_access_level'
       order by e.enumsortorder`,
    );
    expect(rows.map((row) => row.enumlabel)).toEqual([
      "read_only",
      "support_operations",
      "restricted_write",
    ]);
  });
});
