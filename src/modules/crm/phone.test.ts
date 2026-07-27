import { describe, expect, it } from "vitest";

import { normalizeBrazilianPhone, normalizeEmail } from "./phone";

describe("normalização de meios de contato", () => {
  it.each([
    ["11 3456-7890", "+551134567890"],
    ["(11) 93456-7890", "+5511934567890"],
    ["55 11 3456.7890", "+551134567890"],
    ["+55 (11) 93456-7890", "+5511934567890"],
  ])("normaliza telefone brasileiro sem alterar seus dígitos", (raw, expected) => {
    expect(normalizeBrazilianPhone(raw)).toBe(expected);
  });

  it("não insere nem remove o nono dígito", () => {
    expect(normalizeBrazilianPhone("11 3456-7890")).toBe("+551134567890");
    expect(normalizeBrazilianPhone("11 93456-7890")).toBe("+5511934567890");
  });

  it.each(["", "123", "+44 20 7946 0958", "11-ABCD-7890", "005511934567890"])(
    "rejeita formato fora das regras brasileiras: %s",
    (raw) => expect(normalizeBrazilianPhone(raw)).toBeNull(),
  );

  it("normaliza e-mail preservando pontos e +alias", () => {
    expect(normalizeEmail("  Pessoa.Teste+Agenda@Example.COM  ")).toBe(
      "pessoa.teste+agenda@example.com",
    );
  });

  it.each(["sem-arroba", "a@b", "a b@example.com", "@example.com"])(
    "rejeita e-mail inválido: %s",
    (raw) => expect(normalizeEmail(raw)).toBeNull(),
  );
});
