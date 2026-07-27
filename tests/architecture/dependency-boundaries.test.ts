import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Testes de arquitetura via dependency-cruiser (ADR-003/009/011).
 *
 * Executam o binário REAL `depcruise` com as regras REAIS de
 * `.dependency-cruiser.cjs` contra fixtures criadas em um diretório TEMPORÁRIO
 * (fora da árvore da aplicação) e removidas ao final. Nenhum arquivo inválido
 * permanece em `src/`.
 *
 * As regras reais são anexadas a um config temporário sem `tsConfig`/paths
 * (o temp não tem tsconfig), preservando os objetos de regra originais.
 */

const projectRoot = path.resolve(__dirname, "..", "..");
// eslint-disable-next-line @typescript-eslint/no-require-imports -- config CJS
const realConfig = require(path.join(projectRoot, ".dependency-cruiser.cjs"));
const depcruiseBin = path.join(projectRoot, "node_modules", ".bin", "depcruise");

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(path.join(tmpdir(), "arch-fixtures-"));
  const config = {
    forbidden: realConfig.forbidden,
    options: {
      doNotFollow: { path: "node_modules" },
      exclude: { path: "node_modules" },
      tsPreCompilationDeps: true,
    },
  };
  writeFileSync(
    path.join(workdir, "dc.cjs"),
    `module.exports = ${JSON.stringify(config, null, 2)};\n`,
  );
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

function write(rel: string, content: string) {
  const full = path.join(workdir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

/** Roda depcruise e retorna { code, output }. Não lança em violação. */
function runDepcruise(): { code: number; output: string } {
  try {
    const output = execFileSync(depcruiseBin, ["src", "--config", "dc.cjs"], {
      cwd: workdir,
      encoding: "utf8",
    });
    return { code: 0, output };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("fronteiras arquiteturais (dependency-cruiser, regras reais)", () => {
  it("detecta dependência circular", () => {
    write("src/shared/a.ts", `import { b } from "./b";\nexport const a = () => b();\n`);
    write("src/shared/b.ts", `import { a } from "./a";\nexport const b = () => a;\n`);
    const { code, output } = runDepcruise();
    expect(code).not.toBe(0);
    expect(output).toContain("no-circular");
  });

  it("bloqueia shared/ dependendo de módulo de domínio", () => {
    write("src/shared/x.ts", `import { pub } from "../modules/m";\nexport const x = pub;\n`);
    write("src/modules/m/index.ts", `export const pub = 1;\n`);
    const { code, output } = runDepcruise();
    expect(code).not.toBe(0);
    expect(output).toContain("shared-must-not-depend-on-modules");
  });

  it("bloqueia caso de uso de domínio recolocado em shared/auth", () => {
    write(
      "src/shared/auth/invitations.ts",
      `import { db } from "../db";\nexport const invite = () => db;\n`,
    );
    write("src/shared/db.ts", `export const db = 1;\n`);
    const { code, output } = runDepcruise();
    expect(code).not.toBe(0);
    expect(output).toContain("no-domain-use-cases-in-shared-auth");
  });

  it("bloqueia importação de internals de outro módulo", () => {
    write("src/modules/a/index.ts", `import { secret } from "../b/internal";\nexport const a = secret;\n`);
    write("src/modules/b/internal.ts", `export const secret = 42;\n`);
    const { code, output } = runDepcruise();
    expect(code).not.toBe(0);
    expect(output).toContain("no-cross-module-internals");
  });

  it("bloqueia componente de domínio dentro de shared/ui", () => {
    write("src/shared/ui/bad.tsx", `import { pub } from "../../modules/m";\nexport const Bad = () => pub;\n`);
    write("src/modules/m/index.ts", `export const pub = 1;\n`);
    const { code, output } = runDepcruise();
    expect(code).not.toBe(0);
    expect(output).toContain("shared-ui-no-domain");
  });

  it("não acusa violação em estrutura correta (módulo via index público)", () => {
    write("src/modules/a/index.ts", `import { pub } from "../b";\nexport const a = pub;\n`);
    write("src/modules/b/index.ts", `export const pub = 1;\n`);
    const { code } = runDepcruise();
    expect(code).toBe(0);
  });
});
