import type { AppointmentStatus } from "@/modules/scheduling";

import { STATUS_LABELS } from "./agenda-view-model";

/**
 * Transições de status que a escrita realmente aceita, a partir do status
 * atual.
 *
 * Isto não é uma máquina de estados nova: é a leitura, em um lugar só, das
 * regras que a RPC `update_appointment_status` já impõe hoje —
 *
 * 1. o destino tem de ser um dos status do enum (`STATUS_LABELS` tem
 *    exatamente as chaves de `AppointmentStatus`, e o compilador cobra isso);
 * 2. gravar o mesmo status é no-op;
 * 3. **cancelado é terminal** — sair dele levanta erro; reativar exige um novo
 *    agendamento auditável.
 *
 * Não existe, no domínio, um grafo de progressão (`agendado → confirmado → …`):
 * qualquer status não-cancelado alcança qualquer outro. A interface, portanto,
 * oferece o que o servidor aceita e nada além disso — inventar uma ordem
 * obrigatória aqui seria criar regra de negócio na tela, o que exigiria ADR.
 *
 * O botão continua sendo só conforto: quem autoriza é a RPC (ADR-004).
 */
export function validStatusTransitions(
  current: AppointmentStatus,
): readonly AppointmentStatus[] {
  if (current === "canceled") return [];
  return (Object.keys(STATUS_LABELS) as AppointmentStatus[])
    .filter((status) => status !== current);
}
