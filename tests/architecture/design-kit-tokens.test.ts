import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * docs/design/kit.html copia os tokens de src/app/globals.css para conseguir
 * ser autocontido (sem build, sem rede). Cópia desatualiza em silêncio: o app
 * muda, o kit continua mostrando a paleta antiga e os mockups feitos a partir
 * dele descrevem uma tela que o código não reproduz.
 *
 * Este teste é o alarme dessa divergência. Ele compara token a token os blocos
 * :root e .dark dos dois arquivos.
 */

const GLOBALS = "src/app/globals.css";
const KIT = "docs/design/kit.html";

const repoRoot = path.resolve(__dirname, "../..");

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

/**
 * Extrai o primeiro bloco `selector { ... }` de `source` a partir de `from`.
 * Os blocos de token não têm chaves aninhadas, então a primeira `}` fecha.
 */
function block(source: string, selector: string, from = 0): string {
  const open = source.indexOf(`${selector} {`, from);
  if (open === -1) {
    throw new Error(
      `Bloco "${selector} {" não encontrado. Este teste depende dele para ` +
        `comparar os tokens; se o bloco foi renomeado ou reformatado, ajuste ` +
        `este teste junto.`,
    );
  }
  const close = source.indexOf("}", open);
  return source.slice(open, close);
}

/** Lê as declarações `--token: valor;` de um bloco CSS, ignorando comentários. */
function tokens(cssBlock: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of cssBlock.matchAll(
    /^\s*(?<name>--[\w-]+)\s*:\s*(?<value>[^;]+);/gm,
  )) {
    const { name, value } = match.groups ?? {};
    if (name && value) {
      found.set(name, value.trim());
    }
  }
  return found;
}

/**
 * Recorta a seção "1. TOKENS" do kit. O kit declara um segundo `:root` logo
 * depois, com as escalas derivadas do `@theme inline` — essas não são cópia do
 * bloco `:root` de globals.css e ficam de fora da comparação.
 */
function kitTokenSection(kit: string): string {
  const start = kit.indexOf("/* 1. TOKENS");
  const end = kit.indexOf("/* 2. BASE");
  if (start === -1 || end === -1) {
    throw new Error(
      `Os cabeçalhos de seção "1. TOKENS" e "2. BASE" sumiram de ${KIT}. ` +
        `Eles delimitam a região que este teste compara com ${GLOBALS}; ` +
        `restaure-os ou ajuste este teste junto.`,
    );
  }
  return kit.slice(start, end);
}

function relatorio(
  selector: string,
  origem: Map<string, string>,
  copia: Map<string, string>,
): string[] {
  const linhas: string[] = [];

  for (const [name, value] of origem) {
    if (!copia.has(name)) {
      linhas.push(`  falta no kit:      ${name}: ${value};`);
    } else if (copia.get(name) !== value) {
      linhas.push(
        `  valor divergente:  ${name}\n` +
          `                     ${GLOBALS}: ${value}\n` +
          `                     ${KIT}: ${copia.get(name)}`,
      );
    }
  }

  for (const [name, value] of copia) {
    if (!origem.has(name)) {
      linhas.push(`  sobra no kit:      ${name}: ${value};`);
    }
  }

  return linhas.length === 0 ? [] : [`Bloco ${selector}:`, ...linhas];
}

const COMO_CORRIGIR =
  `\nO que fazer:\n` +
  `  1. Abra ${KIT}, seção "1. TOKENS", e copie por cima os blocos :root e\n` +
  `     .dark de ${GLOBALS} — literalmente, sem reordenar nem arredondar\n` +
  `     valores. (Não mexa no segundo :root do kit: ele guarda as escalas\n` +
  `     derivadas do @theme inline, que não vêm desses blocos.)\n` +
  `  2. Abra o kit no navegador e confira nos dois temas, usando o toggle.\n` +
  `     Token novo costuma pedir mais que a linha copiada: se ele existe para\n` +
  `     um estado ou componente que o kit ainda não mostra, acrescente a\n` +
  `     amostra correspondente.\n` +
  `  3. Se o token saiu do app, apague também os usos dele no kit — token\n` +
  `     removido vira var() sem valor, que o navegador ignora em silêncio.\n\n` +
  `Por que isto bloqueia: o kit é a base dos mockups de tela. Desatualizado,\n` +
  `ele leva o design a desenhar com uma paleta que o código não tem mais.\n` +
  `Atualizar ${KIT} faz parte do "pronto" de qualquer PR que mexa em\n` +
  `${GLOBALS} — ver docs/governance/pr-review.md.`;

describe("tokens de tema copiados no kit de design", () => {
  const globals = read(GLOBALS);
  const kit = read(KIT);
  const secaoTokens = kitTokenSection(kit);

  it("mantém o bloco :root do kit igual ao de globals.css", () => {
    const divergencias = relatorio(
      ":root",
      tokens(block(globals, ":root")),
      tokens(block(secaoTokens, ":root")),
    );

    expect(
      divergencias.join("\n"),
      divergencias.length === 0
        ? ""
        : `Os tokens de tema claro divergem entre ${GLOBALS} e ${KIT}.\n\n` +
          divergencias.join("\n") +
          "\n" +
          COMO_CORRIGIR,
    ).toBe("");
  });

  it("mantém o bloco .dark do kit igual ao de globals.css", () => {
    const divergencias = relatorio(
      ".dark",
      tokens(block(globals, ".dark")),
      tokens(block(secaoTokens, ".dark")),
    );

    expect(
      divergencias.join("\n"),
      divergencias.length === 0
        ? ""
        : `Os tokens de tema escuro divergem entre ${GLOBALS} e ${KIT}.\n\n` +
          divergencias.join("\n") +
          "\n" +
          COMO_CORRIGIR,
    ).toBe("");
  });

  it("compara blocos de verdade, não blocos vazios", () => {
    // Sem isto, um :root que virasse vazio nos dois lados passaria como "igual".
    expect(tokens(block(globals, ":root")).size).toBeGreaterThan(30);
    expect(tokens(block(globals, ".dark")).size).toBeGreaterThan(20);
  });
});
