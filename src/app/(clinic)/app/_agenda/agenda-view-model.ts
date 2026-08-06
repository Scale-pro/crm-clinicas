import type { AppointmentStatus } from "@/modules/scheduling";
import type { StatusTone } from "@/shared/ui/status-badge";

/**
 * Núcleo puro da agenda: conversões de fuso, posicionamento na grade e
 * resumos do dia.
 *
 * Nada aqui toca rede, banco ou React — é a parte testável do comportamento
 * das telas Hoje, Agenda e Financeiro. O banco guarda instantes em UTC; a
 * clínica raciocina no seu timezone IANA (ADR-006). Toda a tradução entre os
 * dois mundos acontece nestas funções, uma única vez, e não espalhada pelos
 * componentes.
 */

export type AgendaAppointment = {
  readonly id: string;
  readonly contactId: string;
  readonly contactName: string | null;
  readonly professionalId: string;
  readonly professionalName: string;
  readonly professionalColor: string;
  readonly procedureName: string;
  readonly startAt: string;
  readonly durationMinutes: number;
  readonly priceCents: number;
  readonly status: AppointmentStatus;
  readonly notes: string | null;
  readonly version: number;
};

export const STATUS_LABELS: Readonly<Record<AppointmentStatus, string>> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  arrived: "Chegou",
  in_service: "Em atendimento",
  paid: "Pago",
  canceled: "Cancelado",
};

/**
 * Tom apenas reforça o texto do status — nunca é a única forma de comunicá-lo
 * (ADR-011).
 */
export const STATUS_TONES: Readonly<Record<AppointmentStatus, StatusTone>> = {
  scheduled: "neutral",
  confirmed: "accent",
  arrived: "accent",
  in_service: "warning",
  paid: "success",
  canceled: "neutral",
};

/** Um agendamento cancelado não ocupa horário nem entra em nenhum total. */
export function isActive(appointment: { readonly status: AppointmentStatus }): boolean {
  return appointment.status !== "canceled";
}

/** Já foi efetivamente recebido — base do "Recebido" das telas Hoje/Financeiro. */
export function isSettled(appointment: { readonly status: AppointmentStatus }): boolean {
  return appointment.status === "paid";
}

// ---------------------------------------------------------------------------
// Fuso da clínica
// ---------------------------------------------------------------------------

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function zonedParts(instant: Date, timeZone: string) {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone,
      year: "numeric",
    });
    partsFormatters.set(timeZone, formatter);
  }
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  // `hour12: false` produz 24 para a meia-noite em alguns runtimes.
  return { ...parts, hour: parts.hour === 24 ? 0 : parts.hour } as {
    year: number; month: number; day: number;
    hour: number; minute: number; second: number;
  };
}

/** Deslocamento do fuso (em minutos) vigente no instante informado. */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(
    parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second,
  );
  return (asUtc - instant.getTime()) / 60_000;
}

/** Dia civil da clínica (`YYYY-MM-DD`) em que o instante cai. */
export function zonedDayKey(instant: Date | string, timeZone: string): string {
  const parts = zonedParts(new Date(instant), timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

/**
 * Instante UTC da meia-noite local do dia informado. O deslocamento é medido
 * duas vezes: a primeira estimativa parte do meio-dia (imune a transições de
 * horário de verão) e a segunda é medida no próprio instante calculado.
 */
export function zonedDayStart(dayKey: string, timeZone: string): Date {
  const [year, month, day] = dayKey.split("-").map(Number) as [number, number, number];
  const localMidnight = Date.UTC(year, month - 1, day, 0, 0, 0);
  const noonOffset = zoneOffsetMinutes(new Date(Date.UTC(year, month - 1, day, 12)), timeZone);
  const firstGuess = localMidnight - noonOffset * 60_000;
  const exactOffset = zoneOffsetMinutes(new Date(firstGuess), timeZone);
  return new Date(localMidnight - exactOffset * 60_000);
}

/** Intervalo `[from, to)` em ISO/UTC que cobre `days` dias civis da clínica. */
export function zonedDayRange(dayKey: string, timeZone: string, days = 1): {
  readonly from: string;
  readonly to: string;
} {
  const start = zonedDayStart(dayKey, timeZone);
  const [year, month, day] = dayKey.split("-").map(Number) as [number, number, number];
  const endKey = zonedDayKey(new Date(Date.UTC(year, month - 1, day + days, 12)), timeZone);
  return { from: start.toISOString(), to: zonedDayStart(endKey, timeZone).toISOString() };
}

/** Soma dias civis a uma chave de dia, sem passar por fuso. */
export function shiftDayKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** Minutos desde a meia-noite local da clínica. */
export function minutesIntoDay(startAt: string, dayStart: Date): number {
  return Math.round((new Date(startAt).getTime() - dayStart.getTime()) / 60_000);
}

export function formatMinutesAsTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = String(Math.floor(normalized / 60)).padStart(2, "0");
  const minute = String(normalized % 60).padStart(2, "0");
  return `${hour}:${minute}`;
}

/** Converte um horário local (`HH:MM`) de um dia da clínica em ISO/UTC. */
export function zonedTimeToInstant(dayKey: string, time: string, timeZone: string): string {
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  const dayStart = zonedDayStart(dayKey, timeZone);
  const naive = new Date(dayStart.getTime() + (hour * 60 + minute) * 60_000);
  // Em dias de transição de horário de verão o deslocamento muda no meio do
  // dia: remede no instante alvo para não errar por uma hora.
  const startOffset = zoneOffsetMinutes(dayStart, timeZone);
  const targetOffset = zoneOffsetMinutes(naive, timeZone);
  return new Date(naive.getTime() - (targetOffset - startOffset) * 60_000).toISOString();
}

// ---------------------------------------------------------------------------
// Grade do dia
// ---------------------------------------------------------------------------

export type GridBounds = { readonly startHour: number; readonly endHour: number };

/**
 * Faixa de horas visível. Parte do expediente padrão (08h–19h) e se estende
 * para caber qualquer agendamento fora dele — um horário excepcional nunca
 * fica invisível na grade.
 */
export function gridBounds(
  appointments: readonly AgendaAppointment[],
  dayStart: Date,
  fallback: GridBounds = { startHour: 8, endHour: 19 },
): GridBounds {
  let startHour = fallback.startHour;
  let endHour = fallback.endHour;
  for (const appointment of appointments) {
    if (!isActive(appointment)) continue;
    const from = minutesIntoDay(appointment.startAt, dayStart);
    const to = from + appointment.durationMinutes;
    startHour = Math.min(startHour, Math.floor(from / 60));
    endHour = Math.max(endHour, Math.ceil(to / 60));
  }
  return {
    startHour: Math.max(0, Math.min(startHour, 23)),
    endHour: Math.min(24, Math.max(endHour, startHour + 1)),
  };
}

export type PlacedAppointment = {
  readonly appointment: AgendaAppointment;
  /** Offset do topo, em fração da altura total da grade. */
  readonly top: number;
  /** Altura, em fração da altura total da grade. */
  readonly height: number;
  readonly timeLabel: string;
  readonly endLabel: string;
};

/** Posiciona os agendamentos de uma coluna (um profissional) na grade. */
export function placeAppointments(
  appointments: readonly AgendaAppointment[],
  dayStart: Date,
  bounds: GridBounds,
): readonly PlacedAppointment[] {
  const spanMinutes = (bounds.endHour - bounds.startHour) * 60;
  if (spanMinutes <= 0) return [];
  return appointments
    .filter(isActive)
    .map((appointment) => {
      const from = minutesIntoDay(appointment.startAt, dayStart);
      const offset = from - bounds.startHour * 60;
      const clampedOffset = Math.max(0, Math.min(offset, spanMinutes));
      const visibleDuration = Math.max(
        0,
        Math.min(offset + appointment.durationMinutes, spanMinutes) - clampedOffset,
      );
      return {
        appointment,
        top: clampedOffset / spanMinutes,
        height: visibleDuration / spanMinutes,
        timeLabel: formatMinutesAsTime(from),
        endLabel: formatMinutesAsTime(from + appointment.durationMinutes),
      };
    })
    .sort((left, right) => left.top - right.top);
}

/** Agrupa por profissional preservando a ordem das colunas da grade. */
export function groupByProfessional<T extends { readonly id: string }>(
  professionals: readonly T[],
  appointments: readonly AgendaAppointment[],
): readonly { readonly professional: T; readonly appointments: readonly AgendaAppointment[] }[] {
  return professionals.map((professional) => ({
    professional,
    appointments: appointments
      .filter((appointment) => appointment.professionalId === professional.id)
      .sort((left, right) => left.startAt.localeCompare(right.startAt)),
  }));
}

// ---------------------------------------------------------------------------
// Resumos
// ---------------------------------------------------------------------------

export type DaySummary = {
  readonly total: number;
  readonly canceled: number;
  readonly expectedCents: number;
  readonly settledCents: number;
  readonly pendingCents: number;
  readonly needsAttention: number;
};

/**
 * "Previsto" é o que a agenda promete (tudo que não foi cancelado); "recebido"
 * é o que já foi pago. A diferença é o pendente — nunca um número inventado.
 * "Atenções" conta o que já passou do horário e continua sem desfecho.
 */
export function summarizeDay(
  appointments: readonly AgendaAppointment[],
  now: Date = new Date(),
): DaySummary {
  let total = 0;
  let canceled = 0;
  let expectedCents = 0;
  let settledCents = 0;
  let needsAttention = 0;
  for (const appointment of appointments) {
    if (!isActive(appointment)) {
      canceled += 1;
      continue;
    }
    total += 1;
    expectedCents += appointment.priceCents;
    if (isSettled(appointment)) settledCents += appointment.priceCents;
    const ended = new Date(appointment.startAt).getTime()
      + appointment.durationMinutes * 60_000;
    if (ended < now.getTime() && appointment.status !== "paid") needsAttention += 1;
  }
  return {
    total,
    canceled,
    expectedCents,
    settledCents,
    pendingCents: expectedCents - settledCents,
    needsAttention,
  };
}

export type HourlyPoint = {
  readonly label: string;
  readonly appointments: number;
  readonly settledCents: number;
};

/** Série do "Resumo do dia": atendimentos e recebimentos por hora. */
export function hourlySeries(
  appointments: readonly AgendaAppointment[],
  dayStart: Date,
  bounds: GridBounds,
): readonly HourlyPoint[] {
  const points: HourlyPoint[] = [];
  for (let hour = bounds.startHour; hour < bounds.endHour; hour += 1) {
    let count = 0;
    let settledCents = 0;
    for (const appointment of appointments) {
      if (!isActive(appointment)) continue;
      if (Math.floor(minutesIntoDay(appointment.startAt, dayStart) / 60) !== hour) continue;
      count += 1;
      if (isSettled(appointment)) settledCents += appointment.priceCents;
    }
    points.push({
      label: `${String(hour).padStart(2, "0")}h`,
      appointments: count,
      settledCents,
    });
  }
  return points;
}

export type ProfessionalPerformance = {
  readonly professionalId: string;
  readonly professionalName: string;
  readonly professionalColor: string;
  readonly appointments: number;
  readonly settledCents: number;
  readonly expectedCents: number;
};

/** Desempenho por profissional — base da tela Equipe e do Financeiro. */
export function performanceByProfessional(
  appointments: readonly AgendaAppointment[],
): readonly ProfessionalPerformance[] {
  const rows = new Map<string, ProfessionalPerformance>();
  for (const appointment of appointments) {
    if (!isActive(appointment)) continue;
    const current = rows.get(appointment.professionalId) ?? {
      professionalId: appointment.professionalId,
      professionalName: appointment.professionalName,
      professionalColor: appointment.professionalColor,
      appointments: 0,
      settledCents: 0,
      expectedCents: 0,
    };
    rows.set(appointment.professionalId, {
      ...current,
      appointments: current.appointments + 1,
      expectedCents: current.expectedCents + appointment.priceCents,
      settledCents: current.settledCents
        + (isSettled(appointment) ? appointment.priceCents : 0),
    });
  }
  return [...rows.values()].sort(
    (left, right) => right.settledCents - left.settledCents
      || left.professionalName.localeCompare(right.professionalName, "pt-BR"),
  );
}

/** Próximos atendimentos a partir de agora, para a timeline da tela Hoje. */
export function upcomingAppointments(
  appointments: readonly AgendaAppointment[],
  now: Date = new Date(),
  limit = 6,
): readonly AgendaAppointment[] {
  const ongoingOrNext = appointments
    .filter(isActive)
    .filter((appointment) => new Date(appointment.startAt).getTime()
      + appointment.durationMinutes * 60_000 >= now.getTime())
    .sort((left, right) => left.startAt.localeCompare(right.startAt));
  return ongoingOrNext.slice(0, limit);
}

/** Slots livres de 30 em 30 minutos, respeitando o que já está marcado. */
export function availableSlots(
  appointments: readonly AgendaAppointment[],
  dayStart: Date,
  bounds: GridBounds,
  durationMinutes: number,
  stepMinutes = 30,
): readonly string[] {
  const busy = appointments.filter(isActive).map((appointment) => {
    const from = minutesIntoDay(appointment.startAt, dayStart);
    return { from, to: from + appointment.durationMinutes };
  });
  const slots: string[] = [];
  const lastStart = bounds.endHour * 60 - durationMinutes;
  for (let minute = bounds.startHour * 60; minute <= lastStart; minute += stepMinutes) {
    const end = minute + durationMinutes;
    const overlaps = busy.some((interval) => interval.from < end && minute < interval.to);
    if (!overlaps) slots.push(formatMinutesAsTime(minute));
  }
  return slots;
}
