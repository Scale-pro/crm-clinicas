import { parseAmountToCents } from "@/shared/lib/currency";
import { MINUTES_IN_DAY, MINUTES_IN_HOUR, formatMinutesAsDuration } from "@/shared/lib/duration";
import { isPlausibleBrPhone, phoneDigits } from "@/shared/lib/phone";
import { collapseSpaces, foldText } from "@/shared/lib/text";

/**
 * Regras puras da fundação de operações da clínica (profissionais,
 * especialidades, procedimentos e disponibilidade semanal).
 *
 * Nada aqui conhece React, banco ou contrato de backend: são funções
 * determinísticas sobre valores de formulário, usadas tanto pelos componentes
 * quanto pelos testes. Quando as RPCs existirem, o servidor continua sendo a
 * autoridade — estas regras são o espelho de interface, nunca a autorização.
 */

// ---------------------------------------------------------------------------
// Disponibilidade semanal
// ---------------------------------------------------------------------------

export const WEEKDAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export const WEEKDAYS: readonly {
  readonly key: WeekdayKey;
  readonly label: string;
  readonly shortLabel: string;
}[] = [
  { key: "monday", label: "Segunda-feira", shortLabel: "Seg" },
  { key: "tuesday", label: "Terça-feira", shortLabel: "Ter" },
  { key: "wednesday", label: "Quarta-feira", shortLabel: "Qua" },
  { key: "thursday", label: "Quinta-feira", shortLabel: "Qui" },
  { key: "friday", label: "Sexta-feira", shortLabel: "Sex" },
  { key: "saturday", label: "Sábado", shortLabel: "Sáb" },
  { key: "sunday", label: "Domingo", shortLabel: "Dom" },
];

/** Segunda a sexta — base do atalho "copiar para os dias úteis". */
export const BUSINESS_DAY_KEYS: readonly WeekdayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
];

export type TimeRangeDraft = {
  readonly id: string;
  readonly start: string;
  readonly end: string;
};

export type DayAvailabilityDraft = {
  readonly enabled: boolean;
  readonly ranges: readonly TimeRangeDraft[];
};

export type WeeklyAvailabilityDraft = Readonly<Record<WeekdayKey, DayAvailabilityDraft>>;

export type RangeIssueCode = "invalid_time" | "end_not_after_start" | "overlap";

export type RangeIssue = {
  readonly weekday: WeekdayKey;
  readonly rangeId: string;
  readonly code: RangeIssueCode;
  readonly message: string;
};

const RANGE_ISSUE_MESSAGES: Readonly<Record<RangeIssueCode, string>> = {
  invalid_time: "Informe início e fim no formato de horas e minutos.",
  end_not_after_start: "O fim precisa ser depois do início, no mesmo dia.",
  overlap: "Este intervalo se sobrepõe a outro do mesmo dia.",
};

/**
 * Converte `"HH:MM"` em minutos desde a meia-noite. Devolve `null` para
 * qualquer texto fora do formato ou fora do dia — nenhum horário atravessa a
 * meia-noite nesta fundação.
 */
export function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number.parseInt(match[1]!, 10);
  const minutes = Number.parseInt(match[2]!, 10);
  if (hours > 23 || minutes > 59) return null;
  return hours * MINUTES_IN_HOUR + minutes;
}

export function formatMinutesAsTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(MINUTES_IN_DAY - 1, Math.round(minutes)));
  const hours = Math.floor(clamped / MINUTES_IN_HOUR);
  const rest = clamped % MINUTES_IN_HOUR;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** Ordena por início e, em empate, por fim. Não altera o array recebido. */
export function sortRanges(ranges: readonly TimeRangeDraft[]): readonly TimeRangeDraft[] {
  return [...ranges].sort((left, right) => {
    const leftStart = parseTimeToMinutes(left.start) ?? Number.MAX_SAFE_INTEGER;
    const rightStart = parseTimeToMinutes(right.start) ?? Number.MAX_SAFE_INTEGER;
    if (leftStart !== rightStart) return leftStart - rightStart;
    const leftEnd = parseTimeToMinutes(left.end) ?? Number.MAX_SAFE_INTEGER;
    const rightEnd = parseTimeToMinutes(right.end) ?? Number.MAX_SAFE_INTEGER;
    return leftEnd - rightEnd;
  });
}

/** `null` quando o intervalo é válido em si mesmo (ainda sem olhar os vizinhos). */
export function validateRange(range: TimeRangeDraft): RangeIssueCode | null {
  const start = parseTimeToMinutes(range.start);
  const end = parseTimeToMinutes(range.end);
  if (start === null || end === null) return "invalid_time";
  if (end <= start) return "end_not_after_start";
  return null;
}

/**
 * Sobreposição real. Intervalos adjacentes (`10:00–12:00` e `12:00–14:00`) não
 * se sobrepõem: o fim de um é o início do outro e nenhum minuto é contado duas
 * vezes.
 */
export function rangesOverlap(left: TimeRangeDraft, right: TimeRangeDraft): boolean {
  const leftStart = parseTimeToMinutes(left.start);
  const leftEnd = parseTimeToMinutes(left.end);
  const rightStart = parseTimeToMinutes(right.start);
  const rightEnd = parseTimeToMinutes(right.end);
  if (leftStart === null || leftEnd === null || rightStart === null || rightEnd === null) return false;
  return leftStart < rightEnd && rightStart < leftEnd;
}

/** IDs de todos os intervalos envolvidos em ao menos uma sobreposição. */
export function findOverlappingRangeIds(ranges: readonly TimeRangeDraft[]): readonly string[] {
  const overlapping = new Set<string>();
  for (let index = 0; index < ranges.length; index += 1) {
    for (let other = index + 1; other < ranges.length; other += 1) {
      const left = ranges[index]!;
      const right = ranges[other]!;
      if (!rangesOverlap(left, right)) continue;
      overlapping.add(left.id);
      overlapping.add(right.id);
    }
  }
  return [...overlapping];
}

export function validateDay(weekday: WeekdayKey, day: DayAvailabilityDraft): readonly RangeIssue[] {
  if (!day.enabled) return [];
  const issues: RangeIssue[] = [];
  for (const range of day.ranges) {
    const code = validateRange(range);
    if (code) issues.push({ code, message: RANGE_ISSUE_MESSAGES[code], rangeId: range.id, weekday });
  }
  const valid = day.ranges.filter((range) => validateRange(range) === null);
  for (const rangeId of findOverlappingRangeIds(valid)) {
    issues.push({
      code: "overlap",
      message: RANGE_ISSUE_MESSAGES.overlap,
      rangeId,
      weekday,
    });
  }
  return issues;
}

export function validateWeek(week: WeeklyAvailabilityDraft): readonly RangeIssue[] {
  return WEEKDAY_KEYS.flatMap((key) => validateDay(key, week[key]));
}

/** Minutos de um dia. Dias desativados e intervalos inválidos valem zero. */
export function dayMinutes(day: DayAvailabilityDraft): number {
  if (!day.enabled) return 0;
  return day.ranges.reduce((total, range) => {
    if (validateRange(range) !== null) return total;
    const start = parseTimeToMinutes(range.start)!;
    const end = parseTimeToMinutes(range.end)!;
    return total + (end - start);
  }, 0);
}

export function weeklyMinutes(week: WeeklyAvailabilityDraft): number {
  return WEEKDAY_KEYS.reduce((total, key) => total + dayMinutes(week[key]), 0);
}

export function activeDayCount(week: WeeklyAvailabilityDraft): number {
  return WEEKDAY_KEYS.filter((key) => week[key].enabled && dayMinutes(week[key]) > 0).length;
}

/** `"08:00–12:00, 13:00–18:00"` ou `"Sem atendimento"` para o dia desativado. */
export function summarizeDay(day: DayAvailabilityDraft): string {
  if (!day.enabled) return "Sem atendimento";
  const ranges = sortRanges(day.ranges).filter((range) => validateRange(range) === null);
  if (ranges.length === 0) return "Sem horários definidos";
  return ranges.map((range) => `${range.start}–${range.end}`).join(", ");
}

/** `"5 dias • 40h por semana"` — resumo humano da carga semanal. */
export function summarizeWeek(week: WeeklyAvailabilityDraft): string {
  const days = activeDayCount(week);
  const minutes = weeklyMinutes(week);
  if (days === 0 || minutes === 0) return "Nenhum horário definido";
  const dayLabel = days === 1 ? "1 dia" : `${days} dias`;
  return `${dayLabel} • ${formatMinutesAsDuration(minutes)} por semana`;
}

/** `"Seg, Ter, Qua"` — versão curta para a coluna de listagem. */
export function summarizeWeekdays(week: WeeklyAvailabilityDraft): string {
  const labels = WEEKDAYS
    .filter((weekday) => week[weekday.key].enabled && dayMinutes(week[weekday.key]) > 0)
    .map((weekday) => weekday.shortLabel);
  return labels.length === 0 ? "Sem horários" : labels.join(", ");
}

export function emptyDay(): DayAvailabilityDraft {
  return { enabled: false, ranges: [] };
}

export function emptyWeek(): WeeklyAvailabilityDraft {
  return Object.fromEntries(
    WEEKDAY_KEYS.map((key) => [key, emptyDay()]),
  ) as WeeklyAvailabilityDraft;
}

/**
 * Copia os intervalos de um dia para os destinos, gerando novos IDs para que
 * cada intervalo continue endereçável de forma independente. O dia de origem
 * nunca é destino de si mesmo.
 */
export function copyDayTo(
  week: WeeklyAvailabilityDraft,
  from: WeekdayKey,
  targets: readonly WeekdayKey[],
  nextId: (weekday: WeekdayKey, index: number) => string,
): WeeklyAvailabilityDraft {
  const source = week[from];
  const next = { ...week };
  for (const target of targets) {
    if (target === from) continue;
    next[target] = {
      enabled: source.enabled,
      ranges: source.ranges.map((range, index) => ({
        end: range.end,
        id: nextId(target, index),
        start: range.start,
      })),
    };
  }
  return next;
}

// ---------------------------------------------------------------------------
// Especialidades
// ---------------------------------------------------------------------------

export const MAX_SPECIALTIES = 12;
export const MAX_SPECIALTY_LENGTH = 40;
/**
 * Espelha o mínimo exigido pelo servidor (`setProfessionalSpecialtiesSchema`).
 * Recusar aqui evita que o cadastro inteiro falhe por causa de uma sigla de uma
 * letra digitada sem querer.
 */
export const MIN_SPECIALTY_LENGTH = 2;

export type SpecialtyAddStatus =
  | "added"
  | "empty"
  | "duplicate"
  | "too_short"
  | "too_long"
  | "limit_reached";

export type SpecialtyAddResult = {
  readonly status: SpecialtyAddStatus;
  readonly specialties: readonly string[];
  readonly message: string | null;
};

/** Remove espaços das pontas e colapsa os internos, preservando a caixa digitada. */
export function normalizeSpecialty(value: string): string {
  return collapseSpaces(value);
}

/** Chave de comparação: mesma especialidade escrita com outra caixa ou acento. */
export function specialtyComparisonKey(value: string): string {
  return foldText(normalizeSpecialty(value));
}

export function hasSpecialty(current: readonly string[], value: string): boolean {
  const key = specialtyComparisonKey(value);
  return current.some((specialty) => specialtyComparisonKey(specialty) === key);
}

export function addSpecialty(current: readonly string[], value: string): SpecialtyAddResult {
  const normalized = normalizeSpecialty(value);
  if (normalized === "") {
    return { message: "Escreva a especialidade antes de adicionar.", specialties: current, status: "empty" };
  }
  if (normalized.length < MIN_SPECIALTY_LENGTH) {
    return {
      message: `Use ao menos ${MIN_SPECIALTY_LENGTH} caracteres por especialidade.`,
      specialties: current,
      status: "too_short",
    };
  }
  if (normalized.length > MAX_SPECIALTY_LENGTH) {
    return {
      message: `Use no máximo ${MAX_SPECIALTY_LENGTH} caracteres por especialidade.`,
      specialties: current,
      status: "too_long",
    };
  }
  if (hasSpecialty(current, normalized)) {
    return { message: "Esta especialidade já está na lista.", specialties: current, status: "duplicate" };
  }
  if (current.length >= MAX_SPECIALTIES) {
    return {
      message: `São permitidas até ${MAX_SPECIALTIES} especialidades por profissional.`,
      specialties: current,
      status: "limit_reached",
    };
  }
  return { message: null, specialties: [...current, normalized], status: "added" };
}

export function removeSpecialty(current: readonly string[], value: string): readonly string[] {
  const key = specialtyComparisonKey(value);
  return current.filter((specialty) => specialtyComparisonKey(specialty) !== key);
}

// ---------------------------------------------------------------------------
// Formulário de profissional
// ---------------------------------------------------------------------------

export type ProfessionalFormValues = {
  readonly displayName: string;
  readonly email: string;
  readonly phone: string;
  readonly registrationType: string;
  readonly registrationNumber: string;
  readonly colorToken: string;
  readonly notes: string;
  readonly status: "active" | "inactive";
  readonly specialties: readonly string[];
  readonly linkedUserId: string | null;
  readonly availability: WeeklyAvailabilityDraft;
};

export type ProfessionalFieldKey =
  | "displayName"
  | "email"
  | "phone"
  | "registrationNumber"
  | "notes"
  | "availability";

export type FieldErrors<Key extends string> = Readonly<Partial<Record<Key, string>>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const MAX_NOTES_LENGTH = 500;

/**
 * Validação de interface do profissional. É deliberadamente permissiva com o
 * que o servidor ainda vai reavaliar: e-mail e telefone são opcionais, e um
 * profissional pode existir sem conta de usuário vinculada.
 */
export function validateProfessionalForm(
  values: ProfessionalFormValues,
): FieldErrors<ProfessionalFieldKey> {
  const errors: Partial<Record<ProfessionalFieldKey, string>> = {};
  const displayName = collapseSpaces(values.displayName);
  if (displayName.length < 2) {
    errors.displayName = "Informe o nome de exibição com pelo menos 2 caracteres.";
  } else if (displayName.length > 80) {
    errors.displayName = "Use no máximo 80 caracteres no nome de exibição.";
  }
  if (values.email.trim() !== "" && !EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = "Informe um e-mail válido ou deixe o campo em branco.";
  }
  const digits = phoneDigits(values.phone);
  if (digits !== "" && !isPlausibleBrPhone(digits)) {
    errors.phone = "Informe DDD e número (10 ou 11 dígitos) ou deixe em branco.";
  }
  if (collapseSpaces(values.registrationNumber).length > 30) {
    errors.registrationNumber = "Use no máximo 30 caracteres no número de registro.";
  }
  if (values.notes.length > MAX_NOTES_LENGTH) {
    errors.notes = `Use no máximo ${MAX_NOTES_LENGTH} caracteres nas observações.`;
  }
  if (validateWeek(values.availability).length > 0) {
    errors.availability = "Revise os horários: há intervalos inválidos ou sobrepostos.";
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Formulário de procedimento
// ---------------------------------------------------------------------------

export type ProcedureFormValues = {
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly durationMinutes: number | null;
  readonly basePriceCents: number | null;
  readonly colorToken: string;
  readonly status: "active" | "inactive";
};

export type ProcedureFieldKey =
  | "name"
  | "description"
  | "category"
  | "durationMinutes"
  | "basePriceCents";

export const MIN_PROCEDURE_MINUTES = 5;
export const MAX_PROCEDURE_MINUTES = MINUTES_IN_DAY;
export const MAX_DESCRIPTION_LENGTH = 500;

/**
 * Validação de interface do procedimento. Preço zero é legítimo (cortesia,
 * avaliação): o que não existe é preço negativo nem duração fora do dia.
 */
export function validateProcedureForm(
  values: ProcedureFormValues,
): FieldErrors<ProcedureFieldKey> {
  const errors: Partial<Record<ProcedureFieldKey, string>> = {};
  const name = collapseSpaces(values.name);
  if (name.length < 2) {
    errors.name = "Informe o nome do procedimento com pelo menos 2 caracteres.";
  } else if (name.length > 80) {
    errors.name = "Use no máximo 80 caracteres no nome.";
  }
  if (collapseSpaces(values.category).length > 40) {
    errors.category = "Use no máximo 40 caracteres na categoria.";
  }
  if (values.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Use no máximo ${MAX_DESCRIPTION_LENGTH} caracteres na descrição.`;
  }
  if (values.durationMinutes === null) {
    errors.durationMinutes = "Informe a duração padrão em minutos.";
  } else if (values.durationMinutes < MIN_PROCEDURE_MINUTES) {
    errors.durationMinutes = `A duração mínima é de ${MIN_PROCEDURE_MINUTES} minutos.`;
  } else if (values.durationMinutes > MAX_PROCEDURE_MINUTES) {
    errors.durationMinutes = "A duração não pode passar de 24 horas.";
  }
  if (values.basePriceCents === null) {
    errors.basePriceCents = "Informe o preço-base. Use 0,00 para procedimento sem cobrança.";
  } else if (values.basePriceCents < 0) {
    errors.basePriceCents = "O preço não pode ser negativo.";
  }
  return errors;
}

/** Lê o preço digitado aceitando `"0"`/`"0,00"` como valor legítimo. */
export function readPriceInput(value: string): number | null {
  return parseAmountToCents(value);
}

/** Ordem estável de leitura dos erros — usada no resumo e no foco inicial. */
export function orderedErrorKeys<Key extends string>(
  errors: FieldErrors<Key>,
  order: readonly Key[],
): readonly Key[] {
  return order.filter((key) => errors[key] !== undefined);
}
