import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const authDirectory = path.join(root, "src/shared/auth");
const allowedFiles = [
  "active-clinic-cookie.test.ts",
  "active-clinic-cookie.ts",
  "index.ts",
  "proxy-session.ts",
  "safe-redirect.test.ts",
  "safe-redirect.ts",
  "session.ts",
];

describe("fronteira transversal de shared/auth", () => {
  it("aceita somente sessão, guards, cookie, redirect e proxy", () => {
    expect(readdirSync(authDirectory).sort()).toEqual(allowedFiles.sort());
  });

  it("não reexporta casos de uso dos módulos de domínio", () => {
    const publicApi = readFileSync(path.join(authDirectory, "index.ts"), "utf8");
    for (const domainSymbol of [
      "acceptClinicInvitation",
      "createInitialClinic",
      "createReadOnlySupportGrant",
      "getMfaState",
      "inviteClinicMember",
      "listPlatformClinics",
      "loginWithPassword",
      "resolveActiveClinicContext",
      "updateClinicSettings",
    ]) {
      expect(publicApi).not.toContain(domainSymbol);
    }
  });

  it("expõe cada módulo somente por index server-only", () => {
    for (const moduleName of ["identity", "tenancy", "platform-admin"]) {
      const entrypoint = readFileSync(
        path.join(root, "src/modules", moduleName, "index.ts"),
        "utf8",
      );
      expect(entrypoint.startsWith('import "server-only";')).toBe(true);
    }
  });
});
