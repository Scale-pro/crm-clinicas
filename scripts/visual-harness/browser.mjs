import { existsSync, readdirSync } from "node:fs";

/**
 * Resolve o Chromium a usar, sem baixar nada.
 *
 * Ordem: `CHROMIUM_PATH` explícito, depois os caminhos que o Playwright usa
 * quando `PLAYWRIGHT_BROWSERS_PATH` está definido, depois o download padrão do
 * playwright-core. Se nada existir, a mensagem diz o que instalar em vez de
 * estourar um erro opaco de spawn.
 */
export function resolveChromium() {
  const candidates = [];
  if (process.env.CHROMIUM_PATH) candidates.push(process.env.CHROMIUM_PATH);

  // O Playwright instala em diretórios versionados (`chromium-1194`), então
  // não dá para montar o caminho por concatenação: é preciso varrer a raiz.
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root && existsSync(root)) {
    const suffixes = [
      "chrome-linux/chrome",
      "chrome-linux/headless_shell",
      "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
    ];
    for (const entry of readdirSync(root).filter((name) => name.startsWith("chromium")).sort().reverse()) {
      for (const suffix of suffixes) candidates.push(`${root}/${entry}/${suffix}`);
    }
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export const LAUNCH_HINT = [
  "Chromium não encontrado.",
  "Defina CHROMIUM_PATH com o caminho do executável, ou instale um navegador",
  "para o Playwright: pnpm dlx playwright-core install chromium",
].join(" ");

/** Cenário × tema × largura que os scripts percorrem. */
export const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

export const CONTEXT_OPTIONS = {
  deviceScaleFactor: 2,
  locale: "pt-BR",
  // Fixo, para que a captura não mude com o fuso da máquina de quem roda.
  timezoneId: "America/Sao_Paulo",
  reducedMotion: "reduce",
};

export const BASE_URL = process.env.HARNESS_URL ?? "http://127.0.0.1:3000/harness";
