import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";

/**
 * Testes de arquitetura (ADR-012): provam que as regras de fronteira do
 * ESLint falham quando violadas, sem deixar arquivos inválidos no código da
 * aplicação. Os trechos abaixo são lintados virtualmente (lintText) com
 * caminhos simulados dentro de src/.
 */

const eslint = new ESLint({ cwd: process.cwd() });

async function lintVirtual(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages ?? [];
}

describe("fronteiras de importação (ESLint)", () => {
  it("bloqueia importação de internals de outro módulo (ADR-003)", async () => {
    const messages = await lintVirtual(
      'import { algo } from "@/modules/pipeline/internal";\nexport const uso = algo;\n',
      "src/app/fixture-arch.ts",
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(true);
  });

  it("bloqueia SDK de fila fora de shared/queue (ADR-009)", async () => {
    const messages = await lintVirtual(
      'import "@upstash/qstash";\n',
      "src/modules/messaging/fixture-arch.ts",
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(true);
  });

  it("bloqueia SDK do Supabase fora de shared/db|auth (ADR-002)", async () => {
    const messages = await lintVirtual(
      'import "@supabase/supabase-js";\n',
      "src/modules/contacts/fixture-arch.ts",
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(true);
  });

  it("permite SDK de fila dentro de shared/queue", async () => {
    const messages = await lintVirtual(
      'import "@upstash/qstash";\n',
      "src/shared/queue/fixture-arch.ts",
    );
    expect(messages.filter((m) => m.ruleId === "no-restricted-imports")).toHaveLength(0);
  });

  it("bloqueia console direto fora de shared/observability (CLAUDE.md)", async () => {
    const messages = await lintVirtual(
      'console.log("nao pode");\n',
      "src/app/fixture-arch.ts",
    );
    expect(messages.some((m) => m.ruleId === "no-console")).toBe(true);
  });

  it("permite console dentro de shared/observability (logger sanitizado)", async () => {
    const messages = await lintVirtual(
      'console.log("saida sanitizada");\n',
      "src/shared/observability/fixture-arch.ts",
    );
    expect(messages.filter((m) => m.ruleId === "no-console")).toHaveLength(0);
  });
});
