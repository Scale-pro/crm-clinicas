// Mede se algum bloco da grade corta texto — objetivamente, sem depender de
// olhar para o screenshot. Ver docs/runbooks/visual-harness.md.
//
// São duas sondas, porque uma só engana:
//
// 1. ESPREME — itens flex com `truncate` (overflow:hidden) têm o min-height
//    implícito resolvido em 0, então encolhem abaixo da própria line-height em
//    vez de transbordar. Nesse estado `scrollHeight === clientHeight` e o
//    bloco parece são, mas o texto sai fatiado na vertical. A sonda compara a
//    altura renderizada de cada linha com a line-height que ela deveria ter.
// 2. TRANSBORDA — com as linhas travadas em `shrink-0`, sobra de conteúdo
//    volta a aparecer como scrollHeight > clientHeight.
import { chromium } from "playwright-core";

import { BASE_URL, CONTEXT_OPTIONS, LAUNCH_HINT, resolveChromium } from "./browser.mjs";

const executablePath = resolveChromium();
if (!executablePath) {
  console.error(LAUNCH_HINT);
  process.exit(1);
}

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const context = await browser.newContext({ ...CONTEXT_OPTIONS, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto(`${BASE_URL}?scenario=grid`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const rows = await page.evaluate(() => {
  const out = [];
  for (const button of document.querySelectorAll("ul[aria-label^='Agendamentos'] li > button")) {
    let squeezed = 0;
    let worst = 0;
    const walk = (element) => {
      for (const child of element.children) {
        if (child.children.length > 0) { walk(child); continue; }
        if (!child.textContent?.trim()) continue;
        const lineHeight = Number.parseFloat(getComputedStyle(child).lineHeight);
        const actual = child.getBoundingClientRect().height;
        if (Number.isFinite(lineHeight) && actual < lineHeight - 1) {
          squeezed += 1;
          worst = Math.max(worst, lineHeight - actual);
        }
      }
    };
    walk(button);
    out.push({
      label: (button.getAttribute("aria-label") ?? "").slice(0, 44),
      boxHeight: Math.round(button.getBoundingClientRect().height),
      squeezed,
      worstPx: Math.round(worst),
      overflowPx: button.scrollHeight - button.clientHeight,
    });
  }
  return out;
});

for (const row of rows) {
  const flag = row.squeezed > 0
    ? `ESPREME ${row.squeezed}L -${row.worstPx}px`
    : row.overflowPx > 0 ? `TRANSBORDA +${row.overflowPx}px` : "ok";
  console.log(`${flag.padEnd(26)} caixa=${String(row.boxHeight).padStart(3)}px  ${row.label}`);
}

const bad = rows.filter((row) => row.squeezed > 0 || row.overflowPx > 0).length;
console.log(`\n${bad} de ${rows.length} blocos com problema.`);

await browser.close();
process.exit(bad === 0 ? 0 : 1);
