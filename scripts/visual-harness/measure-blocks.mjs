// Mede se algum bloco da grade corta texto — objetivamente, sem depender de
// olhar para o screenshot. Ver docs/runbooks/visual-harness.md.
//
// São três sondas, porque nenhuma sozinha basta:
//
// 1. ESPREME — itens flex com `truncate` (overflow:hidden) têm o min-height
//    implícito resolvido em 0, então encolhem abaixo da própria line-height em
//    vez de transbordar. Nesse estado `scrollHeight === clientHeight` e o
//    bloco parece são, mas o texto sai fatiado na vertical. A sonda compara a
//    altura renderizada de cada linha com a line-height que ela deveria ter.
// 2. TRANSBORDA — com as linhas travadas em `shrink-0`, sobra de conteúdo
//    volta a aparecer como scrollHeight > clientHeight.
// 3. CORTA — truncamento horizontal (o `text-overflow: ellipsis` do mockup).
//    Não produz transbordo nem encolhimento vertical: o texto simplesmente
//    some no fim da linha. A sonda compara scrollWidth com clientWidth de cada
//    linha de texto.
//
// Roda nas duas larguras do harness: a coluna mais estreita é onde o nome
// longo quebra primeiro, e é ela que decide se a regra de não truncar se
// sustenta. Mede a grade, a faixa de cancelados e a lista do celular — os três
// lugares que imprimem nome de cliente e procedimento.
import { chromium } from "playwright-core";

import { BASE_URL, CONTEXT_OPTIONS, LAUNCH_HINT, VIEWPORTS, resolveChromium } from "./browser.mjs";

const executablePath = resolveChromium();
if (!executablePath) {
  console.error(LAUNCH_HINT);
  process.exit(1);
}

const TARGETS = [
  { name: "grade", selector: "ul[aria-label^='Agendamentos de'] li > button" },
  { name: "cancelados", selector: "section[aria-label='Cancelados hoje'] li > button" },
  { name: "lista", selector: "section[aria-label='Agendamentos do dia em lista'] li > button" },
];

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
let failures = 0;

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    ...CONTEXT_OPTIONS,
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();

  // Duas passagens no celular: a lista é o padrão, a grade fica atrás do
  // alternador — e cada uma esconde a outra, então nenhuma medição alcança as
  // duas de uma vez.
  const views = viewport.name === "mobile" ? ["list", "grid"] : ["grid"];
  for (const view of views) {
    await page.goto(`${BASE_URL}?scenario=grid`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    if (view === "grid") {
      const gridTab = page.getByRole("button", { name: "Grade" });
      if (await gridTab.count() > 0 && await gridTab.isVisible()) {
        await gridTab.click();
        await page.waitForTimeout(300);
      }
    }

    const rows = await page.evaluate((targets) => {
      const out = [];
      for (const target of targets) {
        for (const box of document.querySelectorAll(target.selector)) {
          // Fora de vista (o outro modo do alternador) não se mede.
          if (box.getBoundingClientRect().height === 0) continue;
          let squeezed = 0;
          let clipped = 0;
          let worstHeight = 0;
          let worstWidth = 0;
          const walk = (element) => {
            for (const child of element.children) {
              if (child.children.length > 0) { walk(child); continue; }
              if (!child.textContent?.trim()) continue;
              const lineHeight = Number.parseFloat(getComputedStyle(child).lineHeight);
              const actual = child.getBoundingClientRect().height;
              if (Number.isFinite(lineHeight) && actual < lineHeight - 1) {
                squeezed += 1;
                worstHeight = Math.max(worstHeight, lineHeight - actual);
              }
              const overWidth = child.scrollWidth - child.clientWidth;
              if (overWidth > 1) {
                clipped += 1;
                worstWidth = Math.max(worstWidth, overWidth);
              }
            }
          };
          walk(box);
          out.push({
            area: target.name,
            label: (box.getAttribute("aria-label") ?? box.textContent ?? "")
              .replace(/\s+/g, " ").trim().slice(0, 40),
            boxHeight: Math.round(box.getBoundingClientRect().height),
            squeezed,
            worstHeightPx: Math.round(worstHeight),
            clipped,
            worstWidthPx: Math.round(worstWidth),
            overflowPx: box.scrollHeight - box.clientHeight,
          });
        }
      }
      return out;
    }, TARGETS);

    console.log(`\n── ${viewport.name} ${viewport.width}px · visão ${view} ──`);
    for (const row of rows) {
      const flag = row.clipped > 0
        ? `CORTA ${row.clipped}L -${row.worstWidthPx}px`
        : row.squeezed > 0
          ? `ESPREME ${row.squeezed}L -${row.worstHeightPx}px`
          : row.overflowPx > 0 ? `TRANSBORDA +${row.overflowPx}px` : "ok";
      console.log(
        `${flag.padEnd(24)} ${row.area.padEnd(11)} caixa=${String(row.boxHeight).padStart(3)}px  ${row.label}`,
      );
    }
    const bad = rows.filter(
      (row) => row.squeezed > 0 || row.overflowPx > 0 || row.clipped > 0,
    ).length;
    failures += bad;
    console.log(`${bad} de ${rows.length} caixas com problema.`);
  }

  await context.close();
}

console.log(`\ntotal: ${failures} caixa(s) com problema.`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
