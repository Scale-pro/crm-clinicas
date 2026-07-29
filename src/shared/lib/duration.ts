/**
 * Duração em minutos — unidade única do domínio de agenda e procedimentos.
 * A formatação é centralizada aqui (pt-BR); a interface nunca monta texto de
 * duração por conta própria.
 */

export const MINUTES_IN_HOUR = 60;
export const MINUTES_IN_DAY = 24 * MINUTES_IN_HOUR;

/** `480` → `"8h"`, `90` → `"1h 30min"`, `45` → `"45min"`, `0` → `"0min"`. */
export function formatMinutesAsDuration(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return "—";
  const minutes = Math.round(totalMinutes);
  const hours = Math.floor(minutes / MINUTES_IN_HOUR);
  const rest = minutes % MINUTES_IN_HOUR;
  if (hours === 0) return `${rest}min`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}min`;
}

/**
 * Lê minutos digitados. Aceita apenas inteiros não negativos; qualquer outra
 * coisa devolve `null` para que a interface mostre erro em vez de assumir zero.
 */
export function parseDurationMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  const minutes = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(minutes) ? minutes : null;
}
