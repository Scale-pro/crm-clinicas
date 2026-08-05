import "server-only";

import {
  listActiveProcedures,
  listActiveProfessionals,
  listAppointments,
} from "@/modules/scheduling";
import { listContacts } from "@/modules/crm";
import { requirePermission } from "@/shared/auth";

import type {
  AgendaContact,
  AgendaProcedure,
  AgendaProfessional,
  AgendaWorkspaceData,
} from "./agenda-types";
import { zonedDayKey, zonedDayRange, type AgendaAppointment } from "./agenda-view-model";

/**
 * Carregamento das telas da agenda.
 *
 * O tenant vem do contexto ativo do chamador — nunca da URL. A tela só recebe
 * o que vai desenhar: nada de `clinicId`, sessão ou objeto de permissão cruza
 * a fronteira para o cliente.
 *
 * O catálogo (profissionais, procedimentos, clientes) é carregado em paralelo
 * com os agendamentos: são leituras independentes e cada uma já é filtrada por
 * RLS. Falha em qualquer leitura de catálogo não derruba a agenda — a tela
 * continua legível, apenas com menos opções de marcação.
 */

const CATALOG_PAGE_SIZE = 100;
const CONTACT_LIMIT = 100;

export type AgendaLoadResult =
  | { readonly ok: true; readonly data: AgendaWorkspaceData }
  | { readonly ok: false; readonly code: "forbidden" | "unavailable" };

export async function loadAgendaWorkspace({ clinicId, timezone, dayKey, days = 1, now }: {
  clinicId: string;
  timezone: string;
  /** Dia civil da clínica. Omitido, usa o dia corrente **da clínica**. */
  dayKey?: string;
  /** Quantidade de dias civis a carregar a partir de `dayKey`. */
  days?: number;
  now?: Date;
}): Promise<AgendaLoadResult> {
  const instant = now ?? new Date();
  const day = dayKey ?? zonedDayKey(instant, timezone);
  const range = zonedDayRange(day, timezone, days);

  const [view, manage, createContact] = await Promise.all([
    requirePermission(clinicId, "appointment.view"),
    requirePermission(clinicId, "appointment.manage"),
    requirePermission(clinicId, "contact.create"),
  ]);
  if (!view.allowed) {
    return { ok: false, code: view.code === "forbidden" ? "forbidden" : "unavailable" };
  }

  const [appointmentsResult, professionalsResult, proceduresResult, contactsResult] =
    await Promise.all([
      listAppointments({ clinicId, from: range.from, to: range.to }),
      listActiveProfessionals({ clinicId, pageSize: CATALOG_PAGE_SIZE }),
      listActiveProcedures({ clinicId, pageSize: CATALOG_PAGE_SIZE }),
      listContacts({ clinicId, limit: CONTACT_LIMIT }),
    ]);

  if (!appointmentsResult.ok) {
    return {
      ok: false,
      code: appointmentsResult.code === "forbidden" ? "forbidden" : "unavailable",
    };
  }

  const appointments: readonly AgendaAppointment[] = appointmentsResult.items;

  const professionals: readonly AgendaProfessional[] = professionalsResult.ok
    ? professionalsResult.items.map((item) => ({
      id: item.id,
      name: item.displayName,
      color: item.color,
    }))
    : [];

  const procedures: readonly AgendaProcedure[] = proceduresResult.ok
    ? proceduresResult.items.map((item) => ({
      id: item.id,
      name: item.name,
      durationMinutes: item.defaultDurationMinutes,
      priceCents: item.basePriceCents,
    }))
    : [];

  const contacts: readonly AgendaContact[] = contactsResult.ok
    ? contactsResult.contacts
      .filter((contact) => contact.archived_at === null)
      .map((contact) => ({ id: contact.id, name: contact.full_name }))
    : [];

  return {
    ok: true,
    data: {
      appointments,
      canCreateContact: createContact.allowed,
      canManage: manage.allowed,
      contacts,
      dayKey: day,
      nowIso: instant.toISOString(),
      procedures,
      professionals,
      timezone,
    },
  };
}
