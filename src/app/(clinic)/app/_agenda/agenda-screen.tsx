"use client";

import { Plus } from "lucide-react";
import Link from "next/link";

import { formatBrlFromCents } from "@/shared/lib/currency";
import { cn } from "@/shared/lib/utils";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { StatusBadge, type StatusTone } from "@/shared/ui/status-badge";

import { OperationsNoticeBanner } from "../_operations/operations-feedback";
import type { AgendaWorkspaceData } from "./agenda-types";
import {
  STATUS_LABELS,
  STATUS_TONES,
  formatMinutesAsTime,
  gridBounds,
  groupByProfessional,
  minutesIntoDay,
  placeAppointments,
  zonedDayKey,
  zonedDayStart,
} from "./agenda-view-model";
import { AppointmentPanel } from "./appointment-panel";
import { NewAppointmentDialog } from "./new-appointment-dialog";
import { useAgendaActions } from "./use-agenda-actions";

/** Altura de uma hora na grade. Fixa, para que a régua da esquerda case. */
const HOUR_HEIGHT_REM = 6;

/**
 * Fundo do bloco por status, derivado do MESMO mapa de tons da etiqueta
 * (`STATUS_TONES`), para que grade e badge nunca discordem. A cor é reforço:
 * o texto do status continua impresso no bloco (ADR-011).
 */
const BLOCK_TONES: Readonly<Record<StatusTone, string>> = {
  neutral: "bg-surface border-border",
  accent: "bg-accent/10 border-accent/30",
  success: "bg-success/10 border-success/30",
  warning: "bg-warning/15 border-warning/40",
  danger: "bg-destructive/10 border-destructive/30",
};

/**
 * Abaixo de 1h o bloco não comporta horário + nome + procedimento + etiqueta
 * sem cortar texto (a 6rem/hora, 45min = 4.5rem contra ~5rem de conteúdo). A
 * densidade acompanha a duração real em vez de estourar a caixa.
 */
function blockDensity(durationMinutes: number): "compact" | "full" {
  return durationMinutes < 60 ? "compact" : "full";
}

/**
 * Grade do dia: uma coluna por profissional, uma linha por hora.
 *
 * Cada agendamento é um `<button>` de verdade — a grade inteira é operável por
 * teclado, sem depender de arrastar (ADR-011). A régua de horas é decorativa e
 * fica fora da ordem de foco; a informação de horário vive no rótulo acessível
 * de cada card.
 */
export function AgendaScreen({
  appointments,
  canCreateContact,
  canManage,
  contacts,
  dayKey,
  nowIso,
  procedures,
  professionals,
  timezone,
}: AgendaWorkspaceData) {
  const agenda = useAgendaActions("/app/agenda");
  const dayStart = zonedDayStart(dayKey, timezone);
  const bounds = gridBounds(appointments, dayStart);
  const hours = Array.from(
    { length: bounds.endHour - bounds.startHour },
    (_, index) => bounds.startHour + index,
  );
  const columns = groupByProfessional(professionals, appointments);
  const gridHeight = `${hours.length * HOUR_HEIGHT_REM}rem`;

  // Linha do "agora": só existe quando o dia em foco É o dia corrente da
  // clínica, e sempre no fuso dela — nunca no relógio do navegador (ADR-006).
  const spanMinutes = (bounds.endHour - bounds.startHour) * 60;
  const nowMinutes = minutesIntoDay(nowIso, dayStart);
  const nowOffset = nowMinutes - bounds.startHour * 60;
  const showNowLine = zonedDayKey(nowIso, timezone) === dayKey
    && nowOffset >= 0
    && nowOffset <= spanMinutes;
  const nowLabel = formatMinutesAsTime(nowMinutes);

  if (professionals.length === 0) {
    return <div className="space-y-3">
      <OperationsNoticeBanner notice={agenda.notice} />
      <EmptyState
        action={<Button asChild size="sm" variant="outline">
          <Link href="/app/settings/professionals">Cadastrar profissionais</Link>
        </Button>}
        description="A agenda mostra uma coluna por profissional. Cadastre ao menos um para começar a marcar atendimentos."
        title="Nenhum profissional ativo"
      />
    </div>;
  }

  return <div className="flex min-h-0 flex-1 flex-col gap-3">
    <OperationsNoticeBanner notice={agenda.notice} />

    {canManage ? <div className="flex justify-end">
      <Button onClick={agenda.openCreate} size="sm" type="button">
        <Plus aria-hidden="true" />
        Novo agendamento
      </Button>
    </div> : null}

    <div className="scroll-slim min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-surface">
      <div className="min-w-[40rem]">
        {/* Cabeçalho das colunas */}
        <div
          className="sticky top-0 z-10 grid border-b border-border bg-surface"
          style={{ gridTemplateColumns: `4rem repeat(${columns.length}, minmax(11rem, 1fr))` }}
        >
          {/* Régua de horas: fixa na horizontal, para que o horário continue
              legível ao rolar a grade lateralmente no celular. */}
          <span className="sticky left-0 z-10 border-r border-border bg-surface" />
          {columns.map(({ professional }) => <div
            className="flex min-w-0 items-center gap-2.5 border-r border-border px-3 py-2.5 last:border-r-0"
            key={professional.id}
          >
            <Avatar accent={professional.color} name={professional.name} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium leading-tight">
                {professional.name}
              </span>
              {professional.specialty ? <span className="block truncate text-xs leading-tight text-muted-foreground">
                {professional.specialty}
              </span> : null}
            </span>
          </div>)}
        </div>

        {/* Corpo da grade */}
        <div
          className="relative grid"
          style={{ gridTemplateColumns: `4rem repeat(${columns.length}, minmax(11rem, 1fr))` }}
        >
          {showNowLine ? <div
            className="pointer-events-none absolute inset-x-0 z-[7] flex items-center"
            style={{ top: `${(nowOffset / spanMinutes) * 100}%` }}
          >
            <span className="sticky left-0 w-16 shrink-0 bg-surface pr-1 text-right text-[0.625rem] font-medium tabular-nums text-destructive">
              {nowLabel}
            </span>
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-destructive" />
            <span aria-hidden="true" className="h-px flex-1 bg-destructive" />
          </div> : null}

          <div
            aria-hidden="true"
            className="sticky left-0 z-[6] border-r border-border bg-surface"
            style={{ height: gridHeight }}
          >
            {hours.map((hour) => <div
              className="relative border-b border-border/60 text-[0.6875rem] text-muted-foreground"
              key={hour}
              style={{ height: `${HOUR_HEIGHT_REM}rem` }}
            >
              <span className="absolute right-2 top-1 tabular-nums">
                {String(hour).padStart(2, "0")}:00
              </span>
            </div>)}
          </div>

          {columns.map(({ professional, appointments: columnAppointments }) => {
            const placed = placeAppointments(columnAppointments, dayStart, bounds);
            return <div
              className="relative border-r border-border last:border-r-0"
              key={professional.id}
              style={{ height: gridHeight }}
            >
              {hours.map((hour) => <div
                aria-hidden="true"
                className="border-b border-border/60"
                key={hour}
                style={{ height: `${HOUR_HEIGHT_REM}rem` }}
              />)}

              <ul aria-label={`Agendamentos de ${professional.name}`} className="absolute inset-0">
                {placed.map((item) => {
                  const { appointment } = item;
                  const density = blockDensity(appointment.durationMinutes);
                  const tone = STATUS_TONES[appointment.status];
                  const name = appointment.contactName ?? "Cliente";
                  return <li
                    className="absolute inset-x-1"
                    key={appointment.id}
                    style={{
                      top: `${item.top * 100}%`,
                      height: `max(1.75rem, ${item.height * 100}%)`,
                    }}
                  >
                    <button
                      aria-label={`${item.timeLabel} às ${item.endLabel}, ${name}, ${appointment.procedureName}, ${STATUS_LABELS[appointment.status]}`}
                      className={cn(
                        "flex size-full flex-col overflow-hidden rounded-md border border-l-[3px] text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        density === "compact" ? "justify-center gap-0 px-2 py-1" : "gap-0.5 px-2 py-1.5",
                        BLOCK_TONES[tone],
                      )}
                      onClick={() => agenda.select(appointment)}
                      style={{ borderLeftColor: professional.color }}
                      type="button"
                    >
                      {density === "compact"
                        ? <>
                          <span aria-hidden="true" className="truncate text-xs font-medium leading-tight">
                            {item.timeLabel} · {name}
                          </span>
                          <span aria-hidden="true" className="truncate text-[0.6875rem] leading-tight text-muted-foreground">
                            {STATUS_LABELS[appointment.status]}
                          </span>
                        </>
                        : <>
                          <span aria-hidden="true" className="truncate text-[0.6875rem] font-medium tabular-nums leading-tight text-muted-foreground">
                            {item.timeLabel}–{item.endLabel}
                          </span>
                          <span aria-hidden="true" className="truncate text-sm font-medium leading-tight">
                            {name}
                          </span>
                          <span aria-hidden="true" className="truncate text-xs leading-tight text-muted-foreground">
                            {appointment.procedureName}
                          </span>
                          <span className="pt-1">
                            <StatusBadge tone={tone}>
                              {STATUS_LABELS[appointment.status]}
                            </StatusBadge>
                          </span>
                        </>}
                    </button>
                  </li>;
                })}
              </ul>
            </div>;
          })}
        </div>
      </div>
    </div>

    {/* Lista equivalente: a grade é visual, mas o dia inteiro continua legível
        em ordem cronológica no celular e por leitor de tela. */}
    <section aria-label="Agendamentos do dia em lista" className="lg:hidden">
      {appointments.length === 0
        ? <EmptyState
          description="Nenhum atendimento marcado para este dia."
          title="Dia livre"
        />
        : <ul className="space-y-2">
          {[...appointments]
            .sort((left, right) => left.startAt.localeCompare(right.startAt))
            .map((appointment) => <li key={appointment.id}>
              <button
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onClick={() => agenda.select(appointment)}
                type="button"
              >
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {formatMinutesAsTime(
                    Math.round(
                      (new Date(appointment.startAt).getTime() - dayStart.getTime()) / 60_000,
                    ),
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {appointment.contactName ?? "Cliente"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {appointment.procedureName} · {appointment.professionalName}
                  </span>
                </span>
                <StatusBadge tone={STATUS_TONES[appointment.status]}>
                  {STATUS_LABELS[appointment.status]}
                </StatusBadge>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {formatBrlFromCents(appointment.priceCents)}
                </span>
              </button>
            </li>)}
        </ul>}
    </section>

    {appointments.length === 0 ? <div className="hidden lg:block">
      <EmptyState
        action={canManage
          ? <Button onClick={agenda.openCreate} size="sm" type="button">
            <Plus aria-hidden="true" />
            Novo agendamento
          </Button>
          : undefined}
        description="Nenhum atendimento marcado para este dia."
        title="Dia livre"
      />
    </div> : null}

    <AppointmentPanel
      appointment={agenda.selected}
      canManage={canManage}
      onChangeStatus={agenda.changeStatus}
      onClose={() => agenda.select(null)}
      pending={agenda.pending}
      timezone={timezone}
    />

    {canManage ? <NewAppointmentDialog
      appointments={appointments}
      canCreateContact={canCreateContact}
      contacts={contacts}
      dayKey={dayKey}
      onClose={agenda.closeCreate}
      onSubmit={agenda.schedule}
      open={agenda.creating}
      pending={agenda.pending}
      procedures={procedures}
      professionals={professionals}
      timezone={timezone}
    /> : null}
  </div>;
}
