import { describe, expect, it } from "vitest";

import { formatBrlFromCents } from "./currency";

describe("formatação monetária pt-BR", () => {
  it("formata centavos e preserva ausência de valor", () => {
    expect(formatBrlFromCents(123456)).toMatch(/R\$\s*1\.234,56/);
    expect(formatBrlFromCents(0)).toMatch(/R\$\s*0,00/);
    expect(formatBrlFromCents(null)).toBeNull();
  });
});
