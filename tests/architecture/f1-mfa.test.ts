import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const migration = readFileSync(
  path.join(root, "supabase/migrations/20260725190000_f1_mfa_and_clinic_settings.sql"),
  "utf8",
).toLowerCase();
const security = readFileSync(
  path.join(root, "src/shared/auth/account-security.ts"),
  "utf8",
);
const callback = readFileSync(
  path.join(root, "src/app/auth/callback/route.ts"),
  "utf8",
);

describe("MFA e AAL2", () => {
  it("a RPC sensível valida AAL2 antes de papel, tenant e parâmetros", () => {
    const body = migration.slice(
      migration.indexOf("create function public.update_clinic_settings"),
    );
    expect(body.indexOf("app_private.require_aal2()")).toBeLessThan(
      body.indexOf("app_private.has_permission"),
    );
    expect(body.indexOf("app_private.require_aal2()")).toBeLessThan(
      body.indexOf("invalid clinic data"),
    );
  });

  it("owner, admin e platform_admin exigem enrollment", () => {
    expect(migration).toContain("cm.role in ('owner', 'admin')");
    expect(migration).toContain("from public.platform_admins");
  });

  it("autogestão recusa a remoção do último fator obrigatório", () => {
    expect(security).toContain("factors.data.totp.length <= 1");
    expect(security).toContain('"last_factor_required"');
    expect(security.indexOf("requireAal2()")).toBeLessThan(
      security.indexOf("mfa.unenroll"),
    );
  });

  it("recuperação não aceita redirect fornecido pelo usuário", () => {
    expect(security).toContain("resetPasswordForEmail(");
    const resetCall = security.slice(
      security.indexOf("resetPasswordForEmail("),
      security.indexOf("resetPasswordForEmail(") + 200,
    );
    expect(resetCall).toContain("serverEnv.APP_URL");
    expect(resetCall).not.toContain("requestedRedirect");
    expect(callback).toContain("exchangeCodeForSession(code)");
    expect(callback).toContain("safeInternalRedirect(");
  });
});
