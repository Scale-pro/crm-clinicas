"use client";

import { CheckCircle2, CreditCard, FileText, Play, XCircle } from "lucide-react";
import Link from "next/link";

import type { AppointmentStatus } from "@/modules/scheduling";
import { formatBrlFromCents } from "@/shared/lib/currency";
import { Button } from "@/shared/ui/button";
import { SidePanel } from "@/shared/ui/side-panel";
import { StatusBadge } from "@/shared/ui/status-badge";

import {
  STATUS_LABELS,
  STATUS_TONES,
  formatMinutesAsTime,
  minutesIntoDay,
  zonedDayStart,
  type AgendaAppointment,
} from "./agenda-view-model";

/**
 * Detalhe de um agendamento com as ações rápidas da recepção.
 *
 * As ações mudam **status**, e status é escrita: cada botão chama a Server
 * Action, que chama a RPC autorizada. Esconder um botão sem permissão é
 * conforto visual, nunca o controle de acesso (ADR-004).
 */
export function AppointmentPanel({
  appointment,
  timezone,
  canManage,
  pending,
  onClose,
  onChangeStatus,
}: {
  appointment: AgendaAppointment | null;
  timezone: string;
  canManage: boolean;
  pending: boolean;
  onClose: () => void;
  onChangeStatus: (appointment: AgendaAppointment, status: AppointmentStatus) => void;
}) {
  if (!appointment) return null;

  const dayStart = zonedDayStart(
    new Intl.DateTimeFormat("sv-SE", { timeZone: timezone }).format(new Date(appointment.startAt)),
    timezone,
  );
  const from = minutesIntoDay(appointment.startAt, dayStart);
  const timeRange = `${formatMinutesAsTime(from)} – ${formatMinutesAsTime(from + appointment.durationMinutes)}`;
  const canceled = appointment.status === "canceled";

  const quickActions: readonly {
    readonly status: AppointmentStatus;
    readonly label: string;
    readonly icon: typeof CheckCircle2;
  }[] = [
    { status: "arrived", label: "Chegou", icon: CheckCircle2 },
    { status: "in_service", label: "Iniciar", icon: Play },
    { status: "paid", label: "Receber", icon: CreditCard },
  ];

  return <SidePanel
    description={`${timeRange} · ${appointment.professionalName}`}
    onClose={onClose}
    open
    title={appointment.contactName ?? "Cliente sem nome visível"}
  >
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge accent={appointment.professionalColor} tone={STATUS_TONES[appointment.status]}>
          {STATUS_LABELS[appointment.status]}
        </StatusBadge>
        <span className="text-sm text-muted-foreground">
          {appointment.durationMinutes} min · {formatBrlFromCents(appointment.priceCents)}
        </span>
      </div>

      <dl className="grid gap-3 rounded-lg border border-border bg-surface-subtle p-4 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Procedimento</dt>
          <dd className="text-right font-medium">{appointment.procedureName}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Profissional</dt>
          <dd className="text-right font-medium">{appointment.professionalName}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Horário</dt>
          <dd className="text-right font-medium tabular-nums">{timeRange}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Valor</dt>
          <dd className="text-right font-medium tabular-nums">
            {formatBrlFromCents(appointment.priceCents)}
          </dd>
        </div>
      </dl>

      {appointment.notes ? <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Observações</h3>
        <p className="mt-1 whitespace-pre-line text-sm">{appointment.notes}</p>
      </div> : null}

      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cliente</h3>
        <Button asChild className="mt-2 w-full justify-start" size="sm" variant="outline">
          <Link href={`/app/contacts/${appointment.contactId}`}>
            <FileText aria-hidden="true" />
            Abrir ficha do cliente
          </Link>
        </Button>
      </div>

      {canManage ? <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Ações rápidas
        </h3>
        {canceled
          ? <p className="mt-2 text-sm text-muted-foreground">
            Agendamento cancelado. Para reagendar, crie um novo — o histórico do cancelamento
            é preservado.
          </p>
          : <>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {quickActions.map((action) => {
                const Icon = action.icon;
                const current = appointment.status === action.status;
                return <Button
                  aria-pressed={current}
                  className="h-auto flex-col gap-1.5 py-3"
                  disabled={pending || current}
                  key={action.status}
                  onClick={() => onChangeStatus(appointment, action.status)}
                  size="sm"
                  type="button"
                  variant={current ? "secondary" : "outline"}
                >
                  <Icon aria-hidden="true" />
                  <span className="text-xs">{action.label}</span>
                </Button>;
              })}
            </div>

            <div className="mt-3 space-y-2">
              <label
                className="block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                htmlFor="appointment-status"
              >
                Alterar status
              </label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                disabled={pending}
                id="appointment-status"
                onChange={(event) => onChangeStatus(
                  appointment,
                  event.target.value as AppointmentStatus,
                )}
                value={appointment.status}
              >
                {(Object.keys(STATUS_LABELS) as AppointmentStatus[])
                  .filter((status) => status !== "canceled")
                  .map((status) => <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>)}
              </select>

              <Button
                className="w-full"
                disabled={pending}
                onClick={() => onChangeStatus(appointment, "canceled")}
                size="sm"
                type="button"
                variant="outline"
              >
                <XCircle aria-hidden="true" />
                Cancelar agendamento
              </Button>
            </div>
          </>}
      </div> : null}
    </div>
  </SidePanel>;
}
