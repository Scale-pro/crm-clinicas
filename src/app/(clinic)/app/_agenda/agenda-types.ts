import type { AgendaAppointment } from "./agenda-view-model";

/**
 * Formatos que atravessam a fronteira servidor → cliente nas telas da agenda.
 * Tudo aqui é serializável e já resolvido no servidor: nenhuma tela recebe
 * `clinicId`, versão de RLS, permissão em aberto ou instância de `Date`.
 */

export type AgendaProfessional = {
  readonly id: string;
  readonly name: string;
  readonly color: string;
};

export type AgendaProcedure = {
  readonly id: string;
  readonly name: string;
  readonly durationMinutes: number;
  readonly priceCents: number;
};

export type AgendaContact = {
  readonly id: string;
  readonly name: string;
};

/** Props comuns às telas Hoje e Agenda. */
export type AgendaWorkspaceData = {
  /** Dia civil da clínica em foco (`YYYY-MM-DD`). */
  readonly dayKey: string;
  readonly timezone: string;
  /** Instante da renderização, em ISO — evita relógio do navegador na leitura. */
  readonly nowIso: string;
  readonly appointments: readonly AgendaAppointment[];
  readonly professionals: readonly AgendaProfessional[];
  readonly procedures: readonly AgendaProcedure[];
  readonly contacts: readonly AgendaContact[];
  /** `appointment.manage` já verificado no servidor. Aqui é só UX (ADR-011). */
  readonly canManage: boolean;
  /** `contact.create` — decide se dá para cadastrar cliente durante a marcação. */
  readonly canCreateContact: boolean;
};
