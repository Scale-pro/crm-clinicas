import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/20260725170000_f1_tenant_authorization.sql",
);
const sql = readFileSync(migrationPath, "utf8").toLowerCase();

describe("migration de autorização da F1", () => {
  it("mantém app_private fora da API e revoga uso dos papéis da aplicação", () => {
    expect(sql).toContain("create schema app_private authorization postgres");
    for (const role of ["public", "anon", "authenticated"]) {
      expect(sql).toContain(`revoke usage on schema app_private from ${role}`);
    }
  });

  it("não cria política genérica FOR ALL", () => {
    expect(sql).not.toMatch(/create policy[\s\S]*?\bfor all\b/);
  });

  it("não cria escrita direta em tabelas append-only", () => {
    expect(sql).not.toMatch(
      /create policy [a-z_]+\s+on public\.(activities|audit_logs)\s+for (insert|update|delete)/,
    );
    expect(sql).not.toMatch(
      /grant (insert|update|delete)[\s\S]*?public\.(activities|audit_logs)[\s\S]*?to authenticated/,
    );
  });

  it("usa a ordem nativa do enum para suporte", () => {
    expect(sql).toContain("sg.access_level >= p_min_level");
    expect(sql).not.toMatch(/access_level::text\s*[<>=]/);
  });

  it("wrappers de identidade não aceitam user_id", () => {
    const wrappers = [
      "current_user_clinic_ids",
      "current_user_has_permission",
      "current_user_is_platform_admin",
    ];
    for (const wrapper of wrappers) {
      const declaration = sql.match(
        new RegExp(`create function public\\.${wrapper}\\(([\\s\\S]*?)\\)\\nreturns`),
      );
      expect(declaration?.[1] ?? "").not.toContain("user_id");
    }
  });
});
