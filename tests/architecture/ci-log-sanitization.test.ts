import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  path.resolve(__dirname, "../../.github/workflows/ci.yml"),
  "utf8",
);
const semgrepWorkflow = readFileSync(
  path.resolve(__dirname, "../../.github/workflows/semgrep.yml"),
  "utf8",
);

function job(name: string, nextName?: string): string {
  const start = workflow.indexOf(`  ${name}:`);
  const end = nextName ? workflow.indexOf(`  ${nextName}:`, start) : workflow.length;
  return workflow.slice(start, end);
}

describe("diagnóstico seguro do job Supabase", () => {
  it("testa e declara o head SHA exato em todos os jobs obrigatórios", () => {
    for (const contents of [
      job("quality", "dependency-audit"),
      job("dependency-audit", "dependency-audit-informational"),
      job("gitleaks", "database-auth"),
      job("database-auth"),
      semgrepWorkflow,
    ]) {
      expect(contents).toContain(
        "ref: ${{ github.event.pull_request.head.sha || github.sha }}",
      );
      expect(contents).toContain("EXPECTED_SHA: ${{ github.event.pull_request.head.sha || github.sha }}");
      expect(contents).toContain('echo "SHA testado: $actual_sha"');
    }
  });

  it("Semgrep roda em PR e push somente na main", () => {
    expect(semgrepWorkflow).toContain('branches: ["main"]');
    expect(semgrepWorkflow).toContain("pull_request:");
    expect(semgrepWorkflow).not.toContain("claude/claude-code-plugin-setup-kysnwn");
  });

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
