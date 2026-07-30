/**
 * Telefone: o valor de trabalho é sempre a sequência de dígitos. A máscara é
 * apenas apresentação — digitar, apagar ou colar nunca corrompe os dígitos.
 * A conversão para E.164 (ADR-006) é responsabilidade do servidor, que conhece
 * o país da clínica; aqui não se inventa prefixo.
 */

const MAX_PHONE_DIGITS = 13;

/** Mantém apenas dígitos, limitados ao maior comprimento aceito em E.164 sem `+`. */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, MAX_PHONE_DIGITS);
}

/**
 * Máscara brasileira progressiva: `(11) 91234-5678`. Comprimentos fora do
 * padrão nacional são devolvidos como digitados (só dígitos), sem truncar.
 */
export function formatBrPhoneDigits(digits: string): string {
  const clean = phoneDigits(digits);
  if (clean.length <= 2) return clean;
  const area = clean.slice(0, 2);
  const rest = clean.slice(2);
  if (rest.length <= 4) return `(${area}) ${rest}`;
  if (rest.length <= 8) return `(${area}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  if (rest.length === 9) return `(${area}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  return clean;
}

/** Aceita telefone fixo (10 dígitos) ou móvel (11 dígitos) brasileiros. */
export function isPlausibleBrPhone(digits: string): boolean {
  const clean = phoneDigits(digits);
  return clean.length === 10 || clean.length === 11;
}
