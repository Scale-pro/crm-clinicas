import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  path.resolve(__dirname, "../../.github/workflows/ci.yml"),
  "utf8",
);

describe("diagnóstico seguro do job Supabase", () => {
  it("nunca imprime supabase status, que contém credenciais locais", () => {
    const diagnostic = workflow.slice(
      workflow.indexOf("- name: Diagnóstico sanitizado em caso de falha"),
      workflow.indexOf("- name: Encerra stack Supabase"),
    );
    expect(diagnostic).not.toMatch(/\bsupabase status\b/);
    expect(diagnostic).toContain("[REDACTED]");
  });

  it("retry de geração de tipos continua bloqueante e limitado", () => {
    const generation = workflow.slice(
      workflow.indexOf("- name: Gera e valida tipos do banco local"),
      workflow.indexOf("- name: Testes de integração, Auth, RLS e isolamento"),
    );
    expect(generation).toContain("for attempt in 1 2 3");
    expect(generation).toContain('test "$generated" = true');
    expect(generation).not.toContain("continue-on-error");
  });
});
