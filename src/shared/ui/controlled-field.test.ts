import { describe, expect, it } from "vitest";

import { formatCentsAsAmount } from "@/shared/lib/currency";

import { resolveSyncedText } from "./controlled-field";

const money = formatCentsAsAmount;
const minutes = (value: number) => String(value);

describe("resolveSyncedText — sincronização de campo controlado", () => {
  it("MoneyInput: valor → null com o campo fora de edição esvazia o texto", () => {
    // Cenário de "Voltar ao preço-base": o override 320,00 vira null.
    const result = resolveSyncedText({ editing: false, format: money, incoming: null, synced: 32_000 });
    expect(result).toEqual({ synced: null, text: "" });
  });

  it("DurationInput: valor → null com o campo fora de edição esvazia o texto", () => {
    // Cenário de "Voltar à duração padrão": o override 90 vira null.
    const result = resolveSyncedText({ editing: false, format: minutes, incoming: null, synced: 90 });
    expect(result).toEqual({ synced: null, text: "" });
  });

  it("limpa preço e duração quando o override é removido (voltar ao padrão)", () => {
    expect(resolveSyncedText({ editing: false, format: money, incoming: null, synced: 25_000 })?.text).toBe("");
    expect(resolveSyncedText({ editing: false, format: minutes, incoming: null, synced: 60 })?.text).toBe("");
  });

  it("adota uma mudança externa de valor quando o campo não está em edição", () => {
    const result = resolveSyncedText({ editing: false, format: money, incoming: 30_000, synced: 25_000 });
    expect(result).toEqual({ synced: 30_000, text: money(30_000) });
  });

  it("não toca no texto enquanto o usuário está digitando (editing)", () => {
    // A digitação em andamento é soberana — nada é reformatado nem reposicionado.
    expect(resolveSyncedText({ editing: true, format: money, incoming: null, synced: 32_000 })).toBeNull();
    expect(resolveSyncedText({ editing: true, format: minutes, incoming: 45, synced: 90 })).toBeNull();
  });

  it("não faz nada quando a prop não mudou desde o último texto refletido", () => {
    expect(resolveSyncedText({ editing: false, format: money, incoming: 25_000, synced: 25_000 })).toBeNull();
    expect(resolveSyncedText({ editing: false, format: minutes, incoming: null, synced: null })).toBeNull();
  });

  it("trata zero como valor legítimo — nunca confunde com ausência de valor", () => {
    // 0 é distinto de null: preço/ duração zero produz texto formatado, não vazio.
    const price = resolveSyncedText({ editing: false, format: money, incoming: 0, synced: null });
    expect(price).toEqual({ synced: 0, text: money(0) });
    expect(price?.text).not.toBe("");

    const duration = resolveSyncedText({ editing: false, format: minutes, incoming: 0, synced: null });
    expect(duration).toEqual({ synced: 0, text: "0" });

    // E o inverso: sair de zero para null esvazia (não permanece "0").
    expect(resolveSyncedText({ editing: false, format: money, incoming: null, synced: 0 })).toEqual({ synced: null, text: "" });
  });
});
