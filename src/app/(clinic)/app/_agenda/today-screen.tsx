"use client";

import { AlertCircle, ArrowRight, CalendarX, CheckCircle2, Plus } from "lucide-react";
import Link from "next/link";

import { formatBrlFromCents } from "@/shared/lib/currency";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { StatusBadge } from "@/shared/ui/status-badge";

import { MetricCard, MetricGrid } from "../_dashboard/metric-card";
import { OperationsNoticeBanner } from "../_operations/operations-feedback";
import type { AgendaWorkspaceData } from "./agenda-types";
import {
  STATUS_LABELS,
  STATUS_TONES,
  formatMinutesAsTime,
  gridBounds,
  hourlySeries,
  minutesIntoDay,
  performanceByProfessional,
  summarizeDay,
  upcomingAppointments,
  zonedDayStart,
} from "./agenda-view-model";
import { AppointmentPanel } from "./appointment-panel";
import { DayChart } from "./day-chart";
import { NewAppointmentDialog } from "./new-appointment-dialog";
import { useAgendaActions } from "./use-agenda-actions";

/**
 * Tela "Hoje": o dia da clínica em um olhar — números do dia, próximos
 * atendimentos, o que precisa de atenção e o resumo por hora.
 *
 * Todos os números derivam dos agendamentos já lidos no servidor. Quando não há
 * dado, a tela diz isso; nenhum indicador é preenchido com estimativa.
 */
export function TodayScreen({
  appointments,
  canCreateContact,
  canManage,
  contacts,
  dayKey,
  greetingName,
  nowIso,
  procedures,
  professionals,
  timezone,
}: AgendaWorkspaceData & { greetingName: string }) {
  const agenda = useAgendaActions("/app/today");
  const now = new Date(nowIso);
  const dayStart = zonedDayStart(dayKey, timezone);
  const bounds = gridBounds(appointments, dayStart);
  const summary = summarizeDay(appointments, now);
  const upcoming = upcomingAppointments(appointments, now);
  const performance = performanceByProfessional(appointments);
  const series = hourlySeries(appointments, dayStart, bounds);

  return <div className="space-y-5">
    <OperationsNoticeBanner notice={agenda.notice} />

    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Bom dia, {greetingName}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {summary.total === 0
            ? "A agenda de hoje está livre."
            : `${summary.total} atendimento${summary.total > 1 ? "s" : ""} marcado${summary.total > 1 ? "s" : ""} para hoje.`}
        </p>
      </div>
      {canManage ? <Button onClick={agenda.openCreate} size="sm" type="button">
        <Plus aria-hidden="true" />
        Novo agendamento
      </Button> : null}
    </header>

    <MetricGrid label="Indicadores do dia">
      <MetricCard
        detail="Hoje"
        label="Atendimentos"
        value={String(summary.total)}
        {...(summary.canceled > 0
          ? { hint: `${summary.canceled} cancelado${summary.canceled > 1 ? "s" : ""} fora do total` }
          : {})}
      />
      <MetricCard
        detail="Soma do que está marcado"
        label="Previsto"
        tone="accent"
        value={formatBrlFromCents(summary.expectedCents) ?? "—"}
      />
      <MetricCard
        detail="Atendimentos já pagos"
        label="Recebido"
        tone="success"
        value={formatBrlFromCents(summary.settledCents) ?? "—"}
      />
      <MetricCard
        detail={summary.needsAttention === 0
          ? "Sem pendências"
          : "Já terminaram e seguem sem pagamento"}
        label="Atenções"
        tone={summary.needsAttention === 0 ? "success" : "warning"}
        value={String(summary.needsAttention)}
      />
    </MetricGrid>

    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <section className="rounded-lg border border-border bg-surface">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Próximos atendimentos</h2>
            <Button asChild size="sm" variant="ghost">
              <Link href="/app/agenda">
                Ver agenda
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </header>

          {upcoming.length === 0
            ? <div className="p-4">
              <EmptyState
                action={canManage
                  ? <Button onClick={agenda.openCreate} size="sm" type="button">
                    <Plus aria-hidden="true" />
                    Novo agendamento
                  </Button>
                  : undefined}
                description={summary.total === 0
                  ? "Nenhum atendimento marcado para hoje."
                  : "Todos os atendimentos de hoje já aconteceram."}
                title="Nada a seguir hoje"
              />
            </div>
            : <ul className="divide-y divide-border">
              {upcoming.map((appointment) => <li key={appointment.id}>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  onClick={() => agenda.select(appointment)}
                  type="button"
                >
                  <span className="w-12 shrink-0 text-sm font-medium tabular-nums">
                    {formatMinutesAsTime(minutesIntoDay(appointment.startAt, dayStart))}
                  </span>
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: appointment.professionalColor }}
                  />
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
                </button>
              </li>)}
            </ul>}
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Resumo do dia</h2>
          <div className="mt-3">
            <DayChart points={series} />
          </div>
        </section>
      </div>

      <div className="space-y-4">
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Precisa da sua atenção</h2>
          {summary.needsAttention === 0
            ? <div className="mt-3 flex items-start gap-3 rounded-lg border border-border bg-surface-subtle p-3">
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success-strong" />
              <div>
                <p className="text-sm font-medium">Agenda em dia</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Nenhum atendimento encerrado sem pagamento registrado.
                </p>
              </div>
            </div>
            : <div className="mt-3 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-strong" />
              <div>
                <p className="text-sm font-medium">
                  {summary.needsAttention} atendimento{summary.needsAttention > 1 ? "s" : ""} sem desfecho
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Já passaram do horário e continuam sem pagamento. Abra o card para
                  registrar chegada, atendimento ou recebimento.
                </p>
              </div>
            </div>}

          {summary.pendingCents > 0 ? <p className="mt-3 text-xs text-muted-foreground">
            A receber hoje:{" "}
            <span className="font-medium tabular-nums text-foreground">
              {formatBrlFromCents(summary.pendingCents)}
            </span>
          </p> : null}
        </section>

        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Por profissional</h2>
          {performance.length === 0
            ? <p className="mt-2 text-sm text-muted-foreground">
              Nenhum atendimento hoje para comparar.
            </p>
            : <ul className="mt-3 space-y-2.5">
              {performance.map((row) => <li className="flex items-center gap-2" key={row.professionalId}>
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: row.professionalColor }}
                />
                <span className="min-w-0 flex-1 truncate text-sm">{row.professionalName}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {row.appointments} at.
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {formatBrlFromCents(row.settledCents)}
                </span>
              </li>)}
            </ul>}
        </section>

        {summary.total === 0 ? <section className="rounded-lg border border-dashed border-border bg-surface-subtle p-4">
          <div className="flex items-start gap-3">
            <CalendarX aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Comece pelo catálogo</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Profissionais e procedimentos cadastrados fazem a marcação preencher
                duração e preço sozinha.
              </p>
              <Button asChild className="mt-2" size="sm" variant="outline">
                <Link href="/app/settings/procedures">Abrir procedimentos</Link>
              </Button>
            </div>
          </div>
        </section> : null}
      </div>
    </div>

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
