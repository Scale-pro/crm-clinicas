import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda client/server (ADR-002/004): a interface pública (`index.ts`) de cada
 * módulo de infraestrutura de servidor deve declarar `import "server-only"` como
 * primeira instrução. Esse marcador faz o build do Next.js FALHAR se o módulo
 * for importado por um Client Component, impedindo que segredos/infra vazem para
 * o bundle do navegador.
 *
 * (A falha de build em si já foi comprovada manualmente na F0.3; este teste
 * garante permanentemente que o marcador não seja removido por engano.)
 *
 * Módulos auxiliares client-safe — como `shared/config/env-schema.ts`, que
 * inclusive define o schema de variáveis públicas — intencionalmente NÃO
 * declaram server-only e não são cobertos aqui.
 */

const projectRoot = path.resolve(__dirname, "..", "..");
const serverOnlyEntrypoints = [
  "src/shared/db/index.ts",
  "src/shared/db/server.ts",
  "src/shared/queue/index.ts",
  "src/shared/auth/index.ts",
  "src/shared/config/index.ts",
  "src/modules/identity/index.ts",
  "src/modules/tenancy/index.ts",
  "src/modules/platform-admin/index.ts",
  "src/modules/crm/index.ts",
];

function firstCodeLine(file: string): string | undefined {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .find(
      (l) =>
        l.length > 0 && !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("/*"),
    );
}

describe("guarda server-only nas interfaces de infraestrutura", () => {
  for (const entry of serverOnlyEntrypoints) {
    it(`${entry} declara server-only como primeira instrução`, () => {
      expect(firstCodeLine(path.join(projectRoot, entry))).toBe('import "server-only";');
    });
  }
});

describe("cliente Supabase do navegador", () => {
  it("não contém marcador server-only", () => {
    const browserClient = readFileSync(
      path.join(projectRoot, "src/shared/db/browser.ts"),
      "utf8",
    );
    expect(browserClient).not.toContain('import "server-only"');
  });
});
