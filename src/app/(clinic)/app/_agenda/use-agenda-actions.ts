"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AppointmentStatus } from "@/modules/scheduling";

import { useOperationsAction } from "../_operations/operations-feedback";
import { changeAppointmentStatusAction, scheduleAppointmentAction } from "./actions";
import { STATUS_LABELS, type AgendaAppointment } from "./agenda-view-model";
import type { SchedulePayload } from "./new-appointment-dialog";

/**
 * Estado compartilhado pelas telas Hoje e Agenda: qual agendamento está aberto,
 * se o formulário de marcação está visível e o resultado da última ação.
 *
 * As ações são as mesmas Server Actions nas duas telas — o que muda entre elas
 * é só o arranjo visual. Depois de gravar, `router.refresh()` recarrega os
 * dados do servidor: a lista exibida nunca é remendada no cliente a partir de
 * um palpite do que o banco fez.
 */
export function useAgendaActions(returnTo: string) {
  const router = useRouter();
  const { notice, pending, run } = useOperationsAction(returnTo);
  const [selected, setSelected] = useState<AgendaAppointment | null>(null);
  const [creating, setCreating] = useState(false);

  async function schedule(payload: SchedulePayload) {
    const result = await run(() => scheduleAppointmentAction(payload), "Agendamento criado.");
    if (result.ok) {
      setCreating(false);
      router.refresh();
    }
  }

  async function changeStatus(appointment: AgendaAppointment, status: AppointmentStatus) {
    const result = await run(
      () => changeAppointmentStatusAction({
        appointmentId: appointment.id,
        expectedVersion: appointment.version,
        status,
      }),
      `Status alterado para ${STATUS_LABELS[status].toLocaleLowerCase("pt-BR")}.`,
    );
    if (result.ok) {
      // Fecha o painel: a versão em mãos ficou velha, e a próxima leitura vem
      // do servidor em vez de um estado remendado aqui.
      setSelected(null);
      router.refresh();
    }
  }

  return {
    changeStatus,
    closeCreate: () => setCreating(false),
    creating,
    notice,
    openCreate: () => setCreating(true),
    pending,
    schedule,
    select: setSelected,
    selected,
  };
}
