import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SidebarClinicSwitcher } from "./clinic-switcher";

const clinics = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Clínica Centro" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Clínica Norte" },
];

function render(idPrefix: string): string {
  return renderToStaticMarkup(
    createElement(SidebarClinicSwitcher, {
      action: async () => undefined,
      activeClinicId: clinics[0]!.id,
      clinics,
      idPrefix,
    }),
  );
}

function idsIn(html: string): string[] {
  return [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]!);
}

describe("SidebarClinicSwitcher", () => {
  it("vincula o label ao select usando o prefixo recebido", () => {
    const html = render("desktop-sidebar");
    expect(html).toContain('for="desktop-sidebar-active-clinic"');
    expect(html).toContain('id="desktop-sidebar-active-clinic"');
    expect(html).toContain('name="clinicId"');
    expect(html).toContain("Clínica Centro");
    expect(html).toContain('type="submit"');
  });

  it("não repete identificadores entre as instâncias desktop e mobile", () => {
    // O shell renderiza as duas sidebars ao mesmo tempo (coluna fixa + drawer).
    const ids = [...idsIn(render("desktop-sidebar")), ...idsIn(render("mobile-sidebar"))];
    expect(ids).toContain("desktop-sidebar-active-clinic");
    expect(ids).toContain("mobile-sidebar-active-clinic");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gera identificadores determinísticos entre renderizações", () => {
    // IDs aleatórios divergiriam entre servidor e cliente e quebrariam o label.
    expect(idsIn(render("desktop-sidebar"))).toEqual(idsIn(render("desktop-sidebar")));
  });
});
