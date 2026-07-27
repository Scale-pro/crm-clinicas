import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");
const migration = readFileSync(
  path.join(
    projectRoot,
    "supabase/migrations/20260725180000_f1_atomic_clinic_registration.sql",
  ),
  "utf8",
).toLowerCase();
const onboarding = readFileSync(
  path.join(projectRoot, "src/modules/tenancy/onboarding.ts"),
  "utf8",
);
const actions = readFileSync(
  path.join(projectRoot, "src/app/auth/actions.ts"),
  "utf8",
);

describe("onboarding inicial seguro", () => {
  it("deriva o ator de auth.uid e nunca aceita user_id", () => {
    expect(migration).toContain("v_actor_id uuid := (select auth.uid())");
    expect(migration).toContain("v_email_confirmed_at is null");
    const declaration = migration.match(
      /create function public\.create_clinic_with_owner\(([\s\S]*?)\)\nreturns/,
    );
    expect(declaration?.[1]).not.toContain("user_id");
  });

  it("serializa concorrência e possui proteção única complementar", () => {
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(migration).toContain(
      "create unique index clinics_one_active_onboarding_per_creator_idx",
    );
  });

  it("cria owner, defaults, activity e audit no mesmo corpo transacional", () => {
    for (const operation of [
      "insert into public.clinics",
      "insert into public.clinic_members",
      "insert into public.clinic_features",
      "insert into public.clinic_limits",
      "app_private.log_activity",
      "app_private.log_audit_event",
    ]) {
      expect(migration).toContain(operation);
    }
  });

  it("Server Action delega à camada que revalida sessão antes da RPC", () => {
    expect(actions).toContain('"use server"');
    expect(actions).toContain("createInitialClinic(input)");
    expect(onboarding).toContain("const guard = await requireSession()");
    expect(onboarding.indexOf("requireSession()")).toBeLessThan(
      onboarding.indexOf('rpc("create_clinic_with_owner"'),
    );
  });
});
