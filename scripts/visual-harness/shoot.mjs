// Captura o harness visual em claro/escuro, desktop e celular.
// Uso e pré-requisitos: docs/runbooks/visual-harness.md
import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

import { BASE_URL, CONTEXT_OPTIONS, LAUNCH_HINT, VIEWPORTS, resolveChromium } from "./browser.mjs";

const OUT = process.argv[2] ?? ".harness-shots";
const SCENARIOS = (process.env.SCENARIOS ?? "grid,empty,no-professionals").split(",");
const THEMES = ["light", "dark"];

const executablePath = resolveChromium();
if (!executablePath) {
  console.error(LAUNCH_HINT);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  args: ["--no-sandbox", "--force-color-profile=srgb", "--font-render-hinting=none"],
});

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    ...CONTEXT_OPTIONS,
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();

  for (const scenario of SCENARIOS) {
    for (const theme of THEMES) {
      await page.goto(`${BASE_URL}?scenario=${scenario}&theme=${theme}`, { waitUntil: "networkidle" });
      // O indicador de dev do Next não faz parte da tela; some da captura.
      await page.addStyleTag({ content: "nextjs-portal, #next-logo, [data-nextjs-toast] { display: none !important; }" });
      // Deixa a hidratação assentar antes de capturar.
      await page.waitForTimeout(600);
      const file = `${OUT}/${scenario}-${theme}-${viewport.name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log(`ok ${file}`);

      // Camadas sobrepostas: abertas por interação real, não por prop, para
      // que a captura mostre o que o usuário veria.
      if (scenario === "grid") {
        const block = page.locator("ul[aria-label^='Agendamentos'] li > button").first();
        if (await block.count() > 0) {
          await block.click();
          await page.waitForTimeout(400);
          const file = `${OUT}/drawer-${theme}-${viewport.name}.png`;
          await page.screenshot({ path: file });
          console.log(`ok ${file}`);
          await page.keyboard.press("Escape");
          await page.waitForTimeout(300);
        }

        const create = page.getByRole("button", { name: "Novo agendamento" }).first();
        if (await create.count() > 0) {
          await create.click();
          await page.waitForTimeout(400);
          const file = `${OUT}/modal-${theme}-${viewport.name}.png`;
          await page.screenshot({ path: file });
          console.log(`ok ${file}`);
          await page.keyboard.press("Escape");
          await page.waitForTimeout(300);
        }
      }

      // No celular, prova que a régua de horas fica fixa ao rolar a grade.
      if (viewport.name === "mobile" && scenario === "grid") {
        const scrolled = await page.evaluate(() => {
          const box = document.querySelector(".scroll-slim");
          if (!box) return false;
          box.scrollLeft = box.scrollWidth;
          return true;
        });
        if (scrolled) {
          await page.waitForTimeout(300);
          const file = `${OUT}/${scenario}-${theme}-mobile-scrolled.png`;
          await page.screenshot({ path: file });
          console.log(`ok ${file}`);
        }
      }
    }
  }
  await context.close();
}

await browser.close();
