import { describe, expect, it } from "vitest";

import { shouldResetForm, type FormResetKey } from "./form-sync";

const key = (over: Partial<FormResetKey> = {}): FormResetKey => ({
  mode: "edit",
  open: true,
  signature: "{a}",
  ...over,
});

describe("shouldResetForm — reinício dos formulários em painel", () => {
  it("reinicia ao reabrir o painel (fechado → aberto)", () => {
    expect(shouldResetForm(key({ open: false }), key({ open: true }))).toBe(true);
  });

  it("reinicia quando muda o procedimento/profissional editado (assinatura diferente)", () => {
    expect(shouldResetForm(key({ signature: "{a}" }), key({ signature: "{b}" }))).toBe(true);
  });

  it("reinicia ao alternar entre create e edit", () => {
    expect(shouldResetForm(key({ mode: "create" }), key({ mode: "edit" }))).toBe(true);
    expect(shouldResetForm(key({ mode: "edit" }), key({ mode: "create" }))).toBe(true);
  });

  it("NÃO reinicia quando o pai recria initialValues com o mesmo conteúdo", () => {
    // Preserva a digitação em andamento: mesma assinatura, mesmo modo, aberto.
    expect(shouldResetForm(key(), key())).toBe(false);
  });

  it("NÃO reinicia com o painel fechado", () => {
    expect(shouldResetForm(key({ open: true }), key({ open: false }))).toBe(false);
    expect(shouldResetForm(key({ open: false }), key({ open: false }))).toBe(false);
  });

  it("uma reabertura com nova entidade reinicia (combina reabrir + assinatura nova)", () => {
    expect(shouldResetForm(
      key({ open: false, signature: "{a}" }),
      key({ open: true, signature: "{b}" }),
    )).toBe(true);
  });
});
