import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/20260725160000_f1_multitenant_identity_schema.sql",
);
const sql = readFileSync(migrationPath, "utf8").toLowerCase();

const requiredTables = [
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
];

describe("migration estrutural da F1", () => {
  it("cria exatamente as 13 tabelas aprovadas", () => {
    const created = [...sql.matchAll(/create table public\.([a-z_]+)/g)].map(
      (match) => match[1],
    );
    expect(created.sort()).toEqual([...requiredTables].sort());
  });

  it("habilita e força RLS na mesma migration para cada tabela", () => {
    for (const table of requiredTables) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`alter table public.${table} force row level security`);
    }
  });

  it("não cria entidades de CRM ou schemas adicionais", () => {
    expect(sql).not.toMatch(
      /create table public\.(contacts|patients|opportunities|pipelines|messages|appointments|tracking)/,
    );
    expect(sql).not.toMatch(/create schema (?!public|app_private)/);
  });

  it("não contém UUID, e-mail ou segredo de ambiente real", () => {
    expect(sql).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
    expect(sql).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
    expect(sql).not.toMatch(/service_role_key|secret_key|jwt_secret/);
  });
});
