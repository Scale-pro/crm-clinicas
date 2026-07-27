import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/20260725210000_f1_platform_support.sql"),
  "utf8",
).toLowerCase();
const serverModule = readFileSync(
  path.resolve(__dirname, "../../src/shared/auth/platform-support.ts"),
  "utf8",
);
const banner = readFileSync(
  path.resolve(__dirname, "../../src/shared/ui/support-mode-banner.tsx"),
  "utf8",
);

describe("suporte isolado", () => {
  it("criação aceita somente read_only pelo enum nativo", () => {
    expect(sql).toContain("access_level <> 'read_only'::public.support_access_level");
    expect(sql).not.toMatch(/access_level::text\s*[<>=]/);
  });

  it("as quatro leituras exigem grant e registram auditoria", () => {
    for (const name of ["members", "invitations", "configuration", "audit"]) {
      const start = sql.indexOf(`create function public.platform_read_clinic_${name}`);
      const body = sql.slice(start, sql.indexOf("$$;", start) + 3);
      expect(body).toContain("app_private.require_support_read");
      expect(body).toContain("app_private.log_audit_event");
      expect(body).not.toContain("select *");
    }
  });

  it("protege todas as RPCs sensíveis com AAL2", () => {
    for (const name of [
      "create_support_grant",
      "revoke_support_grant",
      "platform_list_clinics",
    ]) {
      const start = sql.indexOf(`create function public.${name}`);
      const body = sql.slice(start, sql.indexOf("$$;", start) + 3);
      expect(body).toContain("app_private.require_aal2");
    }
    expect(sql).toMatch(
      /create function app_private\.require_support_read[\s\S]*app_private\.require_aal2\(\)/,
    );
  });

  it("mantém a camada de aplicação server-only e sem nível controlado livremente", () => {
    expect(serverModule.startsWith('import "server-only";')).toBe(true);
    expect(serverModule).toContain('accessLevel: z.literal("read_only")');
    expect(serverModule).not.toMatch(/service.?role/i);
    expect(banner.startsWith('import "server-only";')).toBe(true);
    expect(banner).not.toContain('"use client"');
  });

  it("nenhuma escrita operacional existe sob support grant", () => {
    expect(sql).not.toMatch(/support_(write|update|delete|insert)/);
    expect(serverModule).not.toMatch(/platform_(write|update|delete|insert)/);
  });
});
