import { CalendarClock, CheckCircle2, Clock, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";

import { formatBrlFromCents } from "@/shared/lib/currency";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { StatusBadge } from "@/shared/ui/status-badge";

import { MetricCard, MetricGrid } from "../_dashboard/metric-card";
import {
  STATUS_LABELS,
  STATUS_TONES,
  isActive,
  isSettled,
  performanceByProfessional,
  type AgendaAppointment,
} from "./agenda-view-model";

/**
 * Financeiro derivado da agenda.
 *
 * Tudo aqui sai dos agendamentos do período: **faturamento** é o que está
 * marcado, **recebido** é o que já foi pago, **a receber** é a diferença.
 * Não existe lançamento manual nem despesa: isso seria um domínio financeiro
 * novo, fora do MVP documentado, e entraria por ADR — não por uma tela.
 * A tela diz isso em vez de exibir um total de despesas que ninguém alimentou.
 */
export function FinanceiroScreen({ appointments, periodLabel, timezone }: {
  appointments: readonly AgendaAppointment[];
  periodLabel: string;
  timezone: string;
}) {
  const active = appointments.filter(isActive);
  const settled = active.filter(isSettled);
  const expectedCents = active.reduce((total, item) => total + item.priceCents, 0);
  const settledCents = settled.reduce((total, item) => total + item.priceCents, 0);
  const performance = performanceByProfessional(appointments);
  const averageTicketCents = settled.length === 0
    ? null
    : Math.round(settledCents / settled.length);

  const movements = [...settled]
    .sort((left, right) => right.startAt.localeCompare(left.startAt))
    .slice(0, 12);
  const dateTime = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone,
  });

  return <div className="space-y-5">
    <MetricGrid label={`Indicadores financeiros — ${periodLabel}`}>
      <MetricCard
        detail="Tudo que está marcado no período"
        icon={<CalendarClock />}
        label="Faturamento previsto"
        tone="accent"
        value={formatBrlFromCents(expectedCents) ?? "—"}
      />
      <MetricCard
        detail={`${settled.length} atendimento${settled.length === 1 ? "" : "s"} pago${settled.length === 1 ? "" : "s"}`}
        icon={<CheckCircle2 />}
        label="Recebido"
        tone="success"
        value={formatBrlFromCents(settledCents) ?? "—"}
      />
      <MetricCard
        detail="Marcado e ainda não pago"
        icon={<Clock />}
        label="A receber"
        tone={expectedCents - settledCents > 0 ? "warning" : "neutral"}
        value={formatBrlFromCents(expectedCents - settledCents) ?? "—"}
      />
      <MetricCard
        detail="Média dos atendimentos pagos"
        hint={averageTicketCents === null ? "Nenhum pagamento registrado no período" : undefined}
        icon={<Wallet />}
        label="Ticket médio"
        value={averageTicketCents === null ? "—" : formatBrlFromCents(averageTicketCents) ?? "—"}
      />
    </MetricGrid>

    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Recebido por profissional</h2>
        {performance.length === 0
          ? <p className="mt-2 text-sm text-muted-foreground">
            Nenhum atendimento no período.
          </p>
          : <ul className="mt-3 space-y-3">
            {performance.map((row) => {
              const share = settledCents === 0 ? 0 : row.settledCents / settledCents;
              return <li key={row.professionalId}>
                <div className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: row.professionalColor }}
                  />
                  <span className="min-w-0 flex-1 truncate">{row.professionalName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {row.appointments} at.
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatBrlFromCents(row.settledCents)}
                  </span>
                </div>
                <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.round(share * 100)}%` }}
                  />
                </div>
              </li>;
            })}
          </ul>}
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Últimos recebimentos</h2>
        {movements.length === 0
          ? <div className="mt-3">
            <EmptyState
              description="Nenhum atendimento foi marcado como pago neste período."
              title="Sem recebimentos"
            />
          </div>
          : <ul className="mt-3 divide-y divide-border">
            {movements.map((appointment) => <li
              className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              key={appointment.id}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-success/10 text-success-strong">
                <TrendingUp aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {appointment.contactName ?? "Cliente"}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {appointment.procedureName} · {dateTime.format(new Date(appointment.startAt))}
                </span>
              </span>
              <StatusBadge tone={STATUS_TONES[appointment.status]}>
                {STATUS_LABELS[appointment.status]}
              </StatusBadge>
              <span className="shrink-0 text-sm font-medium tabular-nums text-success-strong">
                {formatBrlFromCents(appointment.priceCents)}
              </span>
            </li>)}
          </ul>}
      </section>
    </div>

    <section className="rounded-lg border border-dashed border-border bg-surface-subtle p-4">
      <h2 className="text-sm font-semibold">Despesas e lançamentos manuais</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Estes números vêm inteiramente da agenda. Despesas, lançamentos avulsos e
        formas de pagamento são um domínio financeiro próprio, ainda não decidido
        para este produto — por isso não há um total de despesas aqui em vez de um
        zero que passaria por informação.
      </p>
      <Button asChild className="mt-3" size="sm" variant="outline">
        <Link href="/app/agenda">Ver agenda do dia</Link>
      </Button>
    </section>
  </div>;
}
