const percentFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
  style: "percent",
});

/**
 * Formata uma proporção (0 a 1) como percentual pt-BR com no máximo uma casa
 * decimal. `null` significa "não há base para calcular" — a interface mostra
 * um travessão em vez de fabricar um número.
 */
export function formatPercent(ratio: number | null): string | null {
  if (ratio === null || !Number.isFinite(ratio)) return null;
  return percentFormatter.format(ratio);
}
