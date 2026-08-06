"use client";

import {
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileText,
  Play,
  UserCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import type { AppointmentStatus } from "@/modules/scheduling";
import { formatBrlFromCents } from "@/shared/lib/currency";
import { cn } from "@/shared/lib/utils";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { SidePanel } from "@/shared/ui/side-panel";
import { StatusBadge, type StatusTone } from "@/shared/ui/status-badge";

import {
  STATUS_LABELS,
  STATUS_TONES,
  formatMinutesAsTime,
  minutesIntoDay,
  zonedDayStart,
  type AgendaAppointment,
} from "./agenda-view-model";
import { validStatusTransitions } from "./status-transitions";

/**
 * Cor de cada ação rápida, indexada pelo TOM do status de destino — o mesmo
 * tom que o bloco e a etiqueta usam para aquele status (`STATUS_TONES`). Assim
 * o botão que leva a "Pago" tem a cor de "Pago" sem que exista um segundo mapa
 * de cor por status para sair de sincronia. A cor nunca carrega a informação
 * sozinha: cada botão tem ícone e rótulo escrito (ADR-011).
 */
const ACTION_TONES: Readonly<Record<StatusTone, string>> = {
  neutral: "border-border hover:bg-muted",
  accent: "border-accent/40 text-accent-strong hover:bg-accent/10",
  success: "border-success/40 text-success-strong hover:bg-success/10",
  warning: "border-warning/50 text-warning-strong hover:bg-warning/15",
  danger: "border-destructive/40 text-destructive hover:bg-destructive/10",
};

const ACTION_ICONS: Readonly<Record<AppointmentStatus, LucideIcon>> = {
  scheduled: CalendarClock,
  confirmed: CheckCircle2,
  arrived: UserCheck,
  in_service: Play,
  paid: CreditCard,
  canceled: XCircle,
};

/**
 * Detalhe de um agendamento com as ações rápidas da recepção.
 *
 * As ações oferecidas são exatamente as transições que a escrita aceita a
 * partir do status atual (ver `status-transitions.ts`) — não um trio fixo
 * repetido em todo estado. Esconder ou não mostrar um botão é conforto visual;
 * o controle de acesso e a regra de transição estão na Server Action e na RPC
 * autorizada (ADR-004).
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
  const name = appointment.contactName ?? "Cliente sem nome visível";
  const tone = STATUS_TONES[appointment.status];

  const transitions = validStatusTransitions(appointment.status);
  // Cancelar é uma transição como as outras, mas com peso diferente na tela:
  // sai da lista de avanço e ganha lugar próprio, longe do clique de rotina.
  const advance = transitions.filter((status) => status !== "canceled");
  const canCancel = transitions.includes("canceled");

  // Linha sem valor não vira "—" nem zero inventado: simplesmente não aparece.
  const rows: readonly { readonly label: string; readonly value: string | null }[] = [
    { label: "Horário", value: timeRange },
    { label: "Duração", value: `${appointment.durationMinutes} min` },
    { label: "Procedimento", value: appointment.procedureName },
    { label: "Valor", value: formatBrlFromCents(appointment.priceCents) },
  ];

  return <SidePanel
    header={<div className="min-w-0 space-y-2">
      <StatusBadge dot tone={tone}>{STATUS_LABELS[appointment.status]}</StatusBadge>
      <div className="min-w-0">
        <h2 className="text-base font-semibold break-words">{name}</h2>
        <p className="text-sm text-muted-foreground break-words">{appointment.procedureName}</p>
      </div>
    </div>}
    onClose={onClose}
    open
    title={name}
  >
    <div className="space-y-5">
      <dl className="space-y-2">
        {rows.filter((row) => row.value !== null).map((row) => <div className="flex items-baseline justify-between gap-4" key={row.label}>
          <dt className="shrink-0 text-xs text-muted-foreground">{row.label}</dt>
          <dd className="text-right text-sm font-medium break-words">{row.value}</dd>
        </div>)}
      </dl>

      {/*
        O protótipo previa telefone e um atalho de WhatsApp aqui. O telefone do
        contato não vem no contrato de leitura de agendamentos
        (`AgendaAppointment` tem `contactId` e `contactName`, não telefone), e
        trazê-lo exigiria alterar `modules/scheduling`. Em vez de um botão que
        não disca, a ficha do cliente — que tem os meios de contato — fica a um
        toque.
      */}
      <div className="grid grid-cols-2 gap-2">
        <Link
          className="flex items-center gap-2.5 rounded-md border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-muted-foreground/40 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          href={`/app/contacts/${appointment.contactId}`}
        >
          <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">Cliente</span>
            <span className="block text-sm font-medium text-accent-strong">Ver ficha</span>
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
            <span className="block text-sm font-medium break-words">{appointment.professionalName}</span>
          </span>
        </div>
      </div>

      {appointment.notes ? <div>
        <h3 className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
          Observações
        </h3>
        <p className="mt-1 whitespace-pre-line text-sm">{appointment.notes}</p>
      </div> : null}

      {canManage ? <div className="border-t border-border pt-4">
        <h3 className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
          Ações rápidas
        </h3>
        {transitions.length === 0
          ? <p className="mt-2 text-sm text-muted-foreground">
            Agendamento cancelado — o cancelamento é definitivo. Para reagendar, crie um novo;
            o histórico do cancelamento é preservado.
          </p>
          : <>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {advance.map((status) => {
                const Icon = ACTION_ICONS[status];
                return <Button
                  className={cn("h-auto justify-start gap-2 py-2.5", ACTION_TONES[STATUS_TONES[status]])}
                  disabled={pending}
                  key={status}
                  onClick={() => onChangeStatus(appointment, status)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Icon aria-hidden="true" />
                  <span className="text-xs">{STATUS_LABELS[status]}</span>
                </Button>;
              })}
            </div>

            {canCancel ? <Button
              className={cn("mt-2 w-full", ACTION_TONES.danger)}
              disabled={pending}
              onClick={() => onChangeStatus(appointment, "canceled")}
              size="sm"
              type="button"
              variant="outline"
            >
              <XCircle aria-hidden="true" />
              Cancelar agendamento
            </Button> : null}
          </>}
      </div> : null}
    </div>
  </SidePanel>;
}
