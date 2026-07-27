import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ClinicSelector } from "./clinic-selector";

describe("ClinicSelector", () => {
  it("renderiza label, select nativo, opções e ação acessíveis por teclado", () => {
    const html = renderToStaticMarkup(
      createElement(ClinicSelector, {
        action: async () => undefined,
        activeClinicId: "11111111-1111-4111-8111-111111111111",
        clinics: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            name: "Clínica acessível",
          },
        ],
      }),
    );

    expect(html).toContain('for="active-clinic"');
    expect(html).toContain('id="active-clinic"');
    expect(html).toContain('name="clinicId"');
    expect(html).toContain("Clínica acessível");
    expect(html).toContain('type="submit"');
  });
});
