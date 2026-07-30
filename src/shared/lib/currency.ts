const brlFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});

const amountFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export function formatBrlFromCents(amountCents: number | null): string | null {
  if (amountCents === null) return null;
  return brlFormatter.format(amountCents / 100);
}

/**
 * Valor sem símbolo, para dentro de um campo já rotulado com "R$"
 * (`1234` centavos → `"12,34"`). O símbolo vive no prefixo do campo para não
 * competir com a digitação.
 */
export function formatCentsAsAmount(amountCents: number): string {
  return amountFormatter.format(amountCents / 100);
}

/**
 * Lê um valor digitado em pt-BR (`"1.234,56"`, `"1234,5"`, `"1234"`) e devolve
 * centavos. Devolve `null` quando o texto não representa um valor não negativo
 * — a interface mostra erro em vez de assumir zero. Sinal negativo nunca é
 * aceito: preço negativo não existe neste domínio.
 */
export function parseAmountToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(trimmed)) return null;
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed.replace(/\.(?=\d{3}(?:\D|$))/g, "");
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}
