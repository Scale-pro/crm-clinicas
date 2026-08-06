"use client";

import { CheckCircle2, CreditCard, FileText, Play, Sparkles, XCircle } from "lucide-react";
import Link from "next/link";

import type { AppointmentStatus } from "@/modules/scheduling";
import { formatBrlFromCents } from "@/shared/lib/currency";
import { cn } from "@/shared/lib/utils";
import { Avatar } from "@/shared/ui/avatar";
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
 * Cor de cada ação rápida. O tom acompanha o significado do estado que a ação
 * grava — o mesmo tom que o bloco e a etiqueta usam para aquele status — e
 * nunca carrega a informação sozinho: cada botão tem ícone e rótulo escrito
 * (ADR-011).
 */
const QUICK_ACTION_STYLES = {
  arrived: "border-success/40 text-success-strong hover:bg-success/10",
  in_service: "border-accent/40 text-accent-strong hover:bg-accent/10",
  paid: "border-warning/50 text-warning-strong hover:bg-warning/15",
} as const;

const QUICK_ACTIONS: readonly {
  readonly status: keyof typeof QUICK_ACTION_STYLES;
  readonly label: string;
  readonly icon: typeof CheckCircle2;
}[] = [
  { status: "arrived", label: "Chegou", icon: CheckCircle2 },
  { status: "in_service", label: "Iniciar", icon: Play },
  { status: "paid", label: "Receber", icon: CreditCard },
];

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
  const name = appointment.contactName ?? "Cliente sem nome visível";

  return <SidePanel
    description={`${timeRange} · ${appointment.durationMinutes} min`}
    onClose={onClose}
    open
    title={name}
  >
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={STATUS_TONES[appointment.status]}>
          {STATUS_LABELS[appointment.status]}
        </StatusBadge>
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatBrlFromCents(appointment.priceCents)}
        </span>
      </div>

      {/*
        O protótipo previa um atalho de WhatsApp aqui. O telefone do contato
        não vem no contrato de leitura de agendamentos (`AgendaAppointment` tem
        `contactId` e `contactName`, não telefone), e trazê-lo exigiria alterar
        `modules/scheduling`. Em vez de um botão que não disca, a ficha do
        cliente — que tem os meios de contato — fica a um toque.
      */}
      <div className="grid grid-cols-2 gap-2">
        <Link
          className="flex items-center gap-2.5 rounded-md border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-muted-foreground/40 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          href={`/app/contacts/${appointment.contactId}`}
        >
          <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">Cliente</span>
            <span className="block truncate text-sm font-medium text-accent-strong">Ver ficha</span>
          </span>
        </Link>

        <div className="flex items-center gap-2.5 rounded-md border border-border bg-surface px-3 py-2.5">
          <Avatar
            accent={appointment.professionalColor}
            className="size-6 text-[0.625rem]"
            name={appointment.professionalName}
          />
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">Profissional</span>
            <span className="block truncate text-sm font-medium">{appointment.professionalName}</span>
          </span>
        </div>
      </div>

      <div className="border-y border-border py-4">
        <h3 className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
          Procedimento
        </h3>
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/10 p-3">
          <span className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-md bg-surface">
              <Sparkles className="size-4 text-accent-strong" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{appointment.procedureName}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {appointment.durationMinutes} min · {timeRange}
              </span>
            </span>
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {formatBrlFromCents(appointment.priceCents)}
          </span>
        </div>
      </div>

      {appointment.notes ? <div>
        <h3 className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
          Observações
        </h3>
        <p className="mt-1 whitespace-pre-line text-sm">{appointment.notes}</p>
      </div> : null}

      {canManage ? <div>
        <h3 className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
          Ações rápidas
        </h3>
        {canceled
          ? <p className="mt-2 text-sm text-muted-foreground">
            Agendamento cancelado. Para reagendar, crie um novo — o histórico do cancelamento
            é preservado.
          </p>
          : <>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                const current = appointment.status === action.status;
                return <Button
                  aria-pressed={current}
                  className={cn(
                    "h-auto flex-col gap-1.5 py-3",
                    current ? undefined : QUICK_ACTION_STYLES[action.status],
                  )}
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
                className="block text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground"
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
