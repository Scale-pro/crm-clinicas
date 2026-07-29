"use client";

import { AlertTriangle, Copy, Plus, Trash2 } from "lucide-react";
import { useId, useRef } from "react";

import { formatMinutesAsDuration } from "@/shared/lib/duration";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { formSelectClassName } from "@/shared/ui/form-field";

import {
  BUSINESS_DAY_KEYS,
  WEEKDAYS,
  copyDayTo,
  dayMinutes,
  summarizeWeek,
  validateDay,
  type DayAvailabilityDraft,
  type TimeRangeDraft,
  type WeekdayKey,
  type WeeklyAvailabilityDraft,
} from "./operations-validation";

const timeInputClassName =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm tabular-nums shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid]:border-destructive";

/** Horário inicial sugerido ao abrir um dia — encurta o caminho mais comum. */
const DEFAULT_RANGE = { end: "18:00", start: "09:00" } as const;

function DayRow({
  weekday,
  day,
  issues,
  disabled,
  onToggle,
  onAddRange,
  onChangeRange,
  onRemoveRange,
  onCopy,
  onCopyBusinessDays,
  idPrefix,
}: {
  weekday: (typeof WEEKDAYS)[number];
  day: DayAvailabilityDraft;
  issues: readonly { readonly rangeId: string; readonly message: string }[];
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
  onAddRange: () => void;
  onChangeRange: (rangeId: string, patch: Partial<Omit<TimeRangeDraft, "id">>) => void;
  onRemoveRange: (rangeId: string) => void;
  onCopy: (target: WeekdayKey) => void;
  onCopyBusinessDays: () => void;
  idPrefix: string;
}) {
  const toggleId = `${idPrefix}-${weekday.key}-enabled`;
  const minutes = dayMinutes(day);
  const issueByRange = new Map<string, string>();
  for (const issue of issues) if (!issueByRange.has(issue.rangeId)) issueByRange.set(issue.rangeId, issue.message);

  return <div className="border-b border-border px-3 py-3 last:border-b-0">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium" htmlFor={toggleId}>
        <input
          checked={day.enabled}
          className="size-4 shrink-0 accent-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          disabled={disabled}
          id={toggleId}
          onChange={(event) => onToggle(event.target.checked)}
          type="checkbox"
        />
        <span className="truncate">{weekday.label}</span>
      </label>
      <span className="text-xs tabular-nums text-muted-foreground">
        {day.enabled ? formatMinutesAsDuration(minutes) : "Sem atendimento"}
      </span>
      {day.enabled ? <Button disabled={disabled} onClick={onAddRange} size="sm" type="button" variant="outline">
        <Plus aria-hidden="true" />
        Intervalo
      </Button> : null}
    </div>

    {day.enabled ? <div className="mt-2 space-y-2 ps-6">
      {day.ranges.length === 0
        ? <p className="text-sm text-muted-foreground">
          Nenhum intervalo neste dia. Adicione ao menos um para o dia contar na carga semanal.
        </p>
        : null}
      {day.ranges.map((range, index) => {
        const startId = `${idPrefix}-${weekday.key}-${range.id}-start`;
        const endId = `${idPrefix}-${weekday.key}-${range.id}-end`;
        const issue = issueByRange.get(range.id) ?? null;
        return <div key={range.id}>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 grow basis-28">
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor={startId}>
                {`Início ${index + 1} · ${weekday.label}`}
              </label>
              <input
                aria-invalid={issue !== null || undefined}
                className={timeInputClassName}
                disabled={disabled}
                id={startId}
                onChange={(event) => onChangeRange(range.id, { start: event.target.value })}
                type="time"
                value={range.start}
              />
            </div>
            <span aria-hidden="true" className="pb-2 text-sm text-muted-foreground">até</span>
            <div className="min-w-0 grow basis-28">
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor={endId}>
                {`Fim ${index + 1} · ${weekday.label}`}
              </label>
              <input
                aria-invalid={issue !== null || undefined}
                className={timeInputClassName}
                disabled={disabled}
                id={endId}
                onChange={(event) => onChangeRange(range.id, { end: event.target.value })}
                type="time"
                value={range.end}
              />
            </div>
            <Button
              aria-label={`Remover intervalo ${index + 1} de ${weekday.label}`}
              disabled={disabled}
              onClick={() => onRemoveRange(range.id)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
          {issue ? <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-destructive" role="alert">
            <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
            {issue}
          </p> : null}
        </div>;
      })}

      {day.ranges.length > 0 ? <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button disabled={disabled} onClick={onCopyBusinessDays} size="sm" type="button" variant="ghost">
          <Copy aria-hidden="true" />
          Copiar para segunda a sexta
        </Button>
        <label className="sr-only" htmlFor={`${idPrefix}-${weekday.key}-copy`}>
          {`Copiar horários de ${weekday.label} para outro dia`}
        </label>
        <select
          className={cn(formSelectClassName, "h-8 w-auto text-xs")}
          disabled={disabled}
          id={`${idPrefix}-${weekday.key}-copy`}
          onChange={(event) => {
            const target = event.target.value as WeekdayKey | "";
            if (target === "") return;
            onCopy(target);
            event.currentTarget.value = "";
          }}
          value=""
        >
          <option value="">Copiar para…</option>
          {WEEKDAYS.filter((option) => option.key !== weekday.key).map((option) => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>
      </div> : null}
    </div> : null}
  </div>;
}

/**
 * Editor de disponibilidade semanal do profissional.
 *
 * Trabalha apenas com o horário local da clínica: não há conversão de fuso aqui
 * (ADR-006 — o horário oficial do agendamento é definido no servidor) e nenhum
 * intervalo atravessa a meia-noite. Sobreposições e horários invertidos são
 * sinalizados com texto e ícone, nunca só com cor; intervalos adjacentes
 * (12:00–13:00 e 13:00–18:00) são válidos.
 */
export function WeeklyAvailabilityEditor({
  availability,
  onChange,
  disabled = false,
  timezoneLabel,
  headingId,
}: {
  availability: WeeklyAvailabilityDraft;
  onChange: (next: WeeklyAvailabilityDraft) => void;
  disabled?: boolean;
  /** Fuso da clínica, apenas informado ao usuário — não há conversão aqui. */
  timezoneLabel?: string;
  headingId?: string;
}) {
  const idPrefix = useId();
  const generatedHeadingId = useId();
  const titleId = headingId ?? generatedHeadingId;
  const counter = useRef(0);

  function nextRangeId(weekday: WeekdayKey): string {
    counter.current += 1;
    return `${weekday}-${counter.current}`;
  }

  function patchDay(weekday: WeekdayKey, day: DayAvailabilityDraft) {
    onChange({ ...availability, [weekday]: day });
  }

  const weekIssues = WEEKDAYS.flatMap((weekday) => validateDay(weekday.key, availability[weekday.key]));

  return <section aria-labelledby={titleId} className="rounded-lg border border-border bg-surface">
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-3">
      <div className="min-w-0">
        {/* `tabIndex` permite que o resumo de erros do formulário traga o foco
            até esta seção — o título é o ponto de entrada acessível dela. */}
        <h3 className="text-sm font-semibold" id={titleId} tabIndex={-1}>Disponibilidade semanal</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Horários no fuso da clínica{timezoneLabel ? ` (${timezoneLabel})` : ""}. Um intervalo não pode passar da meia-noite.
        </p>
      </div>
      <p className="text-xs font-medium tabular-nums" role="status">{summarizeWeek(availability)}</p>
    </div>

    {weekIssues.length > 0 ? <p className="flex items-center gap-1.5 border-b border-border bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive" role="alert">
      <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
      {weekIssues.length} intervalo(s) precisam de ajuste antes de salvar.
    </p> : null}

    <div>
      {WEEKDAYS.map((weekday) => <DayRow
        day={availability[weekday.key]}
        disabled={disabled}
        idPrefix={idPrefix}
        issues={validateDay(weekday.key, availability[weekday.key])}
        key={weekday.key}
        onAddRange={() => {
          const day = availability[weekday.key];
          patchDay(weekday.key, {
            enabled: true,
            ranges: [...day.ranges, { ...DEFAULT_RANGE, id: nextRangeId(weekday.key) }],
          });
        }}
        onChangeRange={(rangeId, patch) => {
          const day = availability[weekday.key];
          patchDay(weekday.key, {
            enabled: day.enabled,
            ranges: day.ranges.map((range) => range.id === rangeId ? { ...range, ...patch } : range),
          });
        }}
        onCopy={(target) => onChange(copyDayTo(availability, weekday.key, [target], nextRangeId))}
        onCopyBusinessDays={() => onChange(copyDayTo(availability, weekday.key, BUSINESS_DAY_KEYS, nextRangeId))}
        onRemoveRange={(rangeId) => {
          const day = availability[weekday.key];
          patchDay(weekday.key, {
            enabled: day.enabled,
            ranges: day.ranges.filter((range) => range.id !== rangeId),
          });
        }}
        onToggle={(enabled) => {
          const day = availability[weekday.key];
          // Ao abrir um dia vazio, já oferece um intervalo padrão editável.
          const ranges = enabled && day.ranges.length === 0
            ? [{ ...DEFAULT_RANGE, id: nextRangeId(weekday.key) }]
            : day.ranges;
          patchDay(weekday.key, { enabled, ranges });
        }}
        weekday={weekday}
      />)}
    </div>
  </section>;
}

/** Leitura somente-visual da semana — usada no detalhe do profissional. */
export function WeeklyAvailabilitySummary({ availability, headingId }: {
  availability: WeeklyAvailabilityDraft;
  headingId?: string;
}) {
  return <div>
    <dl className="divide-y divide-border rounded-lg border border-border bg-surface">
      {WEEKDAYS.map((weekday) => {
        const day = availability[weekday.key];
        const ranges = day.enabled ? day.ranges : [];
        return <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2" key={weekday.key}>
          <dt className="text-sm font-medium">{weekday.label}</dt>
          <dd className="text-sm tabular-nums text-muted-foreground">
            {ranges.length === 0
              ? "Sem atendimento"
              : ranges.map((range) => `${range.start}–${range.end}`).join(", ")}
          </dd>
        </div>;
      })}
    </dl>
    <p className="mt-2 text-xs font-medium tabular-nums" id={headingId}>{summarizeWeek(availability)}</p>
  </div>;
}
