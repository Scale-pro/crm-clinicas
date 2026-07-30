/**
 * Normalização de texto para comparação e busca. Remove acentos e caixa para
 * que "Preenchimento" e "preenchímento" sejam tratados como o mesmo termo.
 * Não altera o valor exibido — apenas a chave usada na comparação.
 */
export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

/** Colapsa espaços internos e remove os das pontas, preservando o texto digitado. */
export function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** `true` quando `term` aparece em qualquer um dos campos, ignorando acentos. */
export function matchesTerm(term: string, fields: readonly (string | null | undefined)[]): boolean {
  const needle = foldText(term);
  if (!needle) return true;
  return fields.some((field) => field != null && foldText(field).includes(needle));
}
