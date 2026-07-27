import { afterAll, describe, expect, it } from "vitest";

import { createTestDbPool } from "./helpers/create-test-db-client";
import {
  findSecurityCatalogViolations,
  type SecurityCatalogViolation,
} from "./helpers/security-catalog";

const pool = createTestDbPool();
afterAll(() => pool.end());

async function withRolledBackMutation(
  mutation: string,
): Promise<SecurityCatalogViolation[]> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(mutation);
    return await findSecurityCatalogViolations(client);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

describe("mutações controladas do catálogo de segurança", () => {
  it("parte de um catálogo sem violações", async () => {
    expect(await findSecurityCatalogViolations(pool)).toEqual([]);
  });

  it("detecta quando uma tabela obrigatória perde ENABLE RLS", async () => {
    const violations = await withRolledBackMutation(
      "alter table public.profiles disable row level security",
    );
    expect(violations).toContainEqual({ invariant: "rls", object: "profiles" });
  });

  it("detecta quando uma tabela obrigatória perde FORCE RLS", async () => {
    const violations = await withRolledBackMutation(
      "alter table public.clinics no force row level security",
    );
    expect(violations).toContainEqual({ invariant: "force_rls", object: "clinics" });
  });

  it("detecta search_path inseguro em função privilegiada", async () => {
    const violations = await withRolledBackMutation(
      "alter function public.current_user_clinic_ids() set search_path = public",
    );
    expect(violations).toContainEqual({
      invariant: "search_path",
      object: "public.current_user_clinic_ids()",
    });
  });

  it("detecta EXECUTE indevido concedido a PUBLIC", async () => {
    const violations = await withRolledBackMutation(
      "grant execute on function public.current_user_clinic_ids() to public",
    );
    expect(violations).toContainEqual({
      invariant: "public_execute",
      object: "public.current_user_clinic_ids()",
    });
  });

  it.each([
    ["UPDATE", "activities"],
    ["DELETE", "audit_logs"],
  ])("detecta política de %s em tabela append-only", async (command, table) => {
    const policy = `f1_mutation_${command.toLowerCase()}`;
    const violations = await withRolledBackMutation(
      `create policy ${policy} on public.${table} for ${command} to authenticated using (true)`,
    );
    expect(violations).toContainEqual({
      invariant: "append_only",
      object: `${table}.${policy}`,
    });
  });
});
