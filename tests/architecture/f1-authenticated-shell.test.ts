import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const source = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const clinicContext = source("src/modules/tenancy/active-clinic.ts");
const cookie = source("src/shared/auth/active-clinic-cookie.ts");
const clinicActions = source("src/app/(clinic)/actions.ts");
const layout = source("src/app/(clinic)/app/layout.tsx");
const logout = source("src/app/auth/logout/route.ts");

function allFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? allFiles(full) : [full];
  });
}

describe("shell autenticado F1.9", () => {
  it("revalida sessão, membership e validade da clínica antes do contexto", () => {
    expect(clinicContext).toContain("requireSession()");
    expect(clinicContext).toContain('rpc("current_user_clinic_ids")');
    expect(clinicContext).toContain('.eq("status", "active")');
    expect(clinicContext).toContain('.is("deleted_at", null)');
    expect(clinicContext).toContain("resolveClinicSelection(clinics.clinics, clinicId)");
    expect(clinicContext).toContain("unstable_rethrow(error)");
    expect(clinicContext).not.toContain("getSession(");
  });

  it("assina o cookie com HMAC e opções seguras somente no servidor", () => {
    expect(cookie).toContain('createHmac("sha256"');
    expect(cookie).toContain("timingSafeEqual");
    expect(clinicContext).toContain("httpOnly: true");
    expect(clinicContext).toContain('sameSite: "lax"');
    expect(clinicContext).toContain('path: "/"');
    expect(clinicContext).toContain("serverEnv.ACTIVE_CLINIC_COOKIE_SECRET");
    expect(clinicContext).toContain('import "server-only"');
  });

  it("troca e mutações repetem validações server-side", () => {
    expect(clinicContext).toContain("selectionSchema.safeParse(input)");
    expect(clinicContext).toContain("canSelectClinic(parsed.data.clinicId, clinics.clinics)");
    expect(clinicActions).toContain("resolveActiveClinicContext()");
    expect(clinicActions).toContain("requestedClinicId !== context.clinic.id");
    expect(clinicActions).toContain("field(formData, \"clinicId\") !== context.clinic.id");
  });

  it("layout trata autenticação, MFA, onboarding, escolha e indisponibilidade", () => {
    for (const state of ["unauthenticated", "mfa_required", "no_memberships", "selection_required", "unavailable"]) {
      expect(layout).toContain(`context.status === \"${state}\"`);
    }
    expect(layout).toContain("resolveActiveClinicContext()");
    expect(layout).not.toContain("localStorage");
  });

  it("logout global também remove o contexto de UX", () => {
    expect(logout).toContain("await signOutCurrentSession()");
    expect(logout).toContain("ACTIVE_CLINIC_COOKIE_NAME");
    expect(logout).toContain("maxAge: 0");
  });

  it("possui estados de loading e erro e limita rotas às fases entregues", () => {
    expect(existsSync(path.join(root, "src/app/(clinic)/app/loading.tsx"))).toBe(true);
    expect(existsSync(path.join(root, "src/app/(clinic)/app/error.tsx"))).toBe(true);
    // "leads" saiu da lista na F2.2.5: /app/leads é a lista de oportunidades
    // já entregue. As demais permanecem proibidas até serem implementadas.
    const forbidden = ["patients", "appointments", "conversations", "whatsapp", "medical-records", "finance"];
    const appFiles = allFiles(path.join(root, "src/app"));
    for (const segment of forbidden) {
      expect(appFiles.some((file) => file.split(path.sep).includes(segment))).toBe(false);
    }
  });

  it("preserva lockfile, migrations e contrato de ambiente da unidade anterior", () => {
    expect(source("package.json")).not.toContain("active-clinic-cookie-secret");
    // Acompanha o backend mesclado na main (F2.2.6, F2.3.1 e F4 agendamentos).
    // O que a F1.9 garante é não contribuir com migration própria.
    expect(allFiles(path.join(root, "supabase/migrations")).length).toBe(31);
    expect(source("src/shared/config/env-schema.ts")).toContain("ACTIVE_CLINIC_COOKIE_SECRET");
  });
});
