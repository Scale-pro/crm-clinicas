import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");
const sessionSource = readFileSync(
  path.join(projectRoot, "src/shared/auth/session.ts"),
  "utf8",
);
const proxySource = readFileSync(path.join(projectRoot, "src/proxy.ts"), "utf8");
const proxySessionSource = readFileSync(
  path.join(projectRoot, "src/shared/auth/proxy-session.ts"),
  "utf8",
);
const logoutSource = readFileSync(
  path.join(projectRoot, "src/app/auth/logout/route.ts"),
  "utf8",
);

describe("sessão SSR e autorização", () => {
  it("valida identidade exclusivamente com getClaims", () => {
    expect(sessionSource).toContain("auth.getClaims()");
    expect(proxySessionSource).toContain("auth.getClaims()");
    expect(`${sessionSource}\n${proxySessionSource}`).not.toContain("getSession(");
  });

  it("guards consultam somente wrappers públicos mínimos", () => {
    expect(sessionSource).toContain('rpc("current_user_clinic_ids")');
    expect(sessionSource).toContain('rpc("current_user_has_permission"');
    expect(sessionSource).toContain('rpc("current_user_is_platform_admin")');
    expect(sessionSource).not.toContain('schema("app_private")');
  });

  it("logout revoga a sessão global antes de redirecionar", () => {
    expect(sessionSource).toContain('signOut({ scope: "global" })');
    expect(logoutSource).toContain("await signOutCurrentSession()");
    expect(logoutSource).toContain("status: 503");
  });

  it("proxy trata expiração com mensagem neutra e caminho sanitizado", () => {
    expect(proxySource).toContain("refreshAuthSession(request)");
    expect(proxySessionSource).toContain('"session_expired"');
    expect(proxySessionSource).toContain("safeInternalRedirect(");
    expect(proxySessionSource).not.toMatch(/console\.(log|error|warn)/);
  });
});
