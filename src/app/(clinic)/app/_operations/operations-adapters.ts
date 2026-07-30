import { phoneDigits } from "@/shared/lib/phone";

import { agendaColorFromHex } from "./agenda-color";
import {
  WEEKDAY_KEYS,
  emptyDay,
  emptyWeek,
  formatMinutesAsTime,
  parseTimeToMinutes,
  summarizeWeek,
  summarizeWeekdays,
  validateRange,
  type WeekdayKey,
  type WeeklyAvailabilityDraft,
} from "./operations-validation";
import type {
  OperationsStatus,
  ProcedureSummaryView,
  ProfessionalSummaryView,
} from "./operations-view-models";

/**
 * Tradução entre os registros de `@/modules/scheduling` e os modelos de
 * apresentação de `_operations`.
 *
 * É um adaptador de fronteira puro: não importa banco, não importa Server
 * Action e não decide autorização. As páginas carregam pelos contratos públicos
 * e passam por aqui antes de entregar aos componentes visuais, que continuam
 * exatamente como foram desenhados.
 */

// ---------------------------------------------------------------------------
// Situação
// ---------------------------------------------------------------------------

/** O backend só emite `active`/`inactive`; qualquer outro valor vira `inactive`. */
export function operationsStatus(status: string): OperationsStatus {
  return status === "active" ? "active" : "inactive";
}

// ---------------------------------------------------------------------------
// Disponibilidade semanal
// ---------------------------------------------------------------------------

/** Intervalo no formato do backend: ISO 1=segunda … 7=domingo, minutos do dia. */
export type WeeklyInterval = {
  readonly weekday: number;
  readonly startMinute: number;
  readonly endMinute: number;
};

/** ISO-8601 (1=segunda … 7=domingo) → chave de dia da interface. */
export function weekdayKeyFromIso(weekday: number): WeekdayKey | null {
  return WEEKDAY_KEYS[weekday - 1] ?? null;
}

/** Chave de dia da interface → ISO-8601 (1=segunda … 7=domingo). */
export function isoFromWeekdayKey(key: WeekdayKey): number {
  return WEEKDAY_KEYS.indexOf(key) + 1;
}

/**
 * Intervalos do backend → rascunho da semana.
 *
 * Um dia só nasce habilitado quando tem ao menos um intervalo: ausência de
 * intervalo é ausência de atendimento, não intervalo vazio.
 */
export function availabilityDraftFromIntervals(
  intervals: readonly WeeklyInterval[],
): WeeklyAvailabilityDraft {
  const draft: Record<WeekdayKey, { enabled: boolean; ranges: { id: string; start: string; end: string }[] }> =
    Object.fromEntries(WEEKDAY_KEYS.map((key) => [key, { enabled: false, ranges: [] }])) as never;

  for (const interval of intervals) {
    const key = weekdayKeyFromIso(interval.weekday);
    if (!key) continue;
    const day = draft[key];
    day.enabled = true;
    const rangeId = `${key}-${day.ranges.length + 1}`;
    day.ranges.push({
      end: formatMinutesAsTime(interval.endMinute),
      id: rangeId,
      start: formatMinutesAsTime(interval.startMinute),
    });
  }

  return Object.fromEntries(
    WEEKDAY_KEYS.map((key) => [
      key,
      draft[key].enabled ? { enabled: true, ranges: draft[key].ranges } : emptyDay(),
    ]),
  ) as WeeklyAvailabilityDraft;
}

/**
 * Rascunho da semana → intervalos do backend.
 *
 * Devolve `null` quando algum intervalo de dia habilitado é inválido: é melhor
 * recusar o envio inteiro do que descartar em silêncio um horário que a pessoa
 * digitou. Dias desabilitados simplesmente não produzem intervalos.
 */
export function intervalsFromAvailabilityDraft(
  draft: WeeklyAvailabilityDraft,
): readonly WeeklyInterval[] | null {
  const intervals: WeeklyInterval[] = [];
  for (const key of WEEKDAY_KEYS) {
    const day = draft[key];
    if (!day.enabled) continue;
    for (const range of day.ranges) {
      if (validateRange(range) !== null) return null;
      intervals.push({
        endMinute: parseTimeToMinutes(range.end)!,
        startMinute: parseTimeToMinutes(range.start)!,
        weekday: isoFromWeekdayKey(key),
      });
    }
  }
  return intervals;
}

/** Comparação estável de duas semanas — evita gravar quando nada mudou. */
export function sameIntervals(
  left: readonly WeeklyInterval[],
  right: readonly WeeklyInterval[],
): boolean {
  const serialize = (intervals: readonly WeeklyInterval[]) => intervals
    .map((interval) => `${interval.weekday}:${interval.startMinute}:${interval.endMinute}`)
    .sort()
    .join("|");
  return serialize(left) === serialize(right);
}

// ---------------------------------------------------------------------------
// Profissionais
// ---------------------------------------------------------------------------

/** Linha devolvida por `listProfessionals` (contrato público de scheduling). */
export type ProfessionalListRow = {
  readonly id: string;
  readonly displayName: string;
  readonly color: string;
  readonly status: string;
  readonly specialties: readonly string[];
};

/**
 * Linha da listagem.
 *
 * `listProfessionals` devolve identificação, cor, situação e especialidades — e
 * só. Usuário vinculado, horários e procedimentos habilitados **não** fazem
 * parte desse contrato, então não são preenchidos aqui: a listagem mostra "—" e
 * o detalhe do profissional traz o dado real. Preencher com um valor plausível
 * seria inventar informação.
 */
export function professionalSummaryFromRow(row: ProfessionalListRow): ProfessionalSummaryView {
  return {
    colorToken: agendaColorFromHex(row.color),
    displayName: row.displayName,
    href: `/app/settings/professionals/${encodeURIComponent(row.id)}`,
    id: row.id,
    specialties: row.specialties,
    status: operationsStatus(row.status),
  };
}

/**
 * E.164 do banco → dígitos nacionais usados pela máscara e pelo formulário.
 *
 * O domínio guarda `+55…` (ADR-006); a interface trabalha com DDD + número. O
 * prefixo do país só é removido quando ele realmente está lá, então um número
 * guardado em outro formato atravessa sem ser mutilado.
 */
export function nationalPhoneDigits(value: string | null): string {
  const digits = phoneDigits(value ?? "");
  const hasCountryPrefix = digits.startsWith("55") && (digits.length === 12 || digits.length === 13);
  return hasCountryPrefix ? digits.slice(2) : digits;
}

/** Resumos de disponibilidade usados no cabeçalho e na listagem do detalhe. */
export function availabilityLabels(availability: WeeklyAvailabilityDraft): {
  readonly weekdaysLabel: string;
  readonly availabilityLabel: string;
} {
  return {
    availabilityLabel: summarizeWeek(availability),
    weekdaysLabel: summarizeWeekdays(availability),
  };
}

export function emptyAvailability(): WeeklyAvailabilityDraft {
  return emptyWeek();
}

// ---------------------------------------------------------------------------
// Procedimentos
// ---------------------------------------------------------------------------

/** Linha devolvida por `listProcedures` (contrato público de scheduling). */
export type ProcedureListRow = {
  readonly id: string;
  readonly name: string;
  readonly category: string | null;
  readonly defaultDurationMinutes: number;
  readonly basePriceCents: number;
  readonly color: string;
  readonly status: string;
};

/**
 * Linha da listagem de procedimentos. `enabledProfessionalCount` fica ausente
 * pelo mesmo motivo: `listProcedures` não conta vínculos, e o número real
 * aparece no detalhe do procedimento.
 */
export function procedureSummaryFromRow(row: ProcedureListRow): ProcedureSummaryView {
  return {
    basePriceCents: row.basePriceCents,
    category: row.category,
    colorToken: agendaColorFromHex(row.color),
    durationMinutes: row.defaultDurationMinutes,
    href: `/app/settings/procedures/${encodeURIComponent(row.id)}`,
    id: row.id,
    name: row.name,
    status: operationsStatus(row.status),
  };
}
