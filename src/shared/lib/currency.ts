const brlFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency",
});

export function formatBrlFromCents(amountCents: number | null): string | null {
  if (amountCents === null) return null;
  return brlFormatter.format(amountCents / 100);
}
