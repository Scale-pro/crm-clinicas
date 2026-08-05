"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createContact } from "@/modules/crm";
import {
  APPOINTMENT_STATUSES,
  createAppointment,
  rescheduleAppointment,
  updateAppointmentStatus,
} from "@/modules/scheduling";
import { resolveActiveClinicContext } from "@/modules/tenancy";

import { schedulingErrorMessage } from "../_operations/operations-errors";
import { zonedTimeToInstant } from "./agenda-view-model";

/**
 * Server Actions da agenda.
 *
 * Finas por decisão: ligam a interface aos contratos públicos de
 * `@/modules/scheduling` e `@/modules/crm`. Nenhuma regra de negócio, consulta
 * ou SQL vive aqui.
 *
 * Invariantes desta camada:
 *
 * - o `clinicId` vem sempre de `resolveActiveClinicContext()`; o navegador
 *   jamais informa a clínica, nem mesmo o fuso usado para converter horários;
 * - o horário chega como dia civil + `HH:MM` locais e é convertido para
 *   instante UTC **no servidor**, com o timezone da clínica (ADR-006);
 * - criar cliente novo durante o agendamento chama o **mesmo** caso de uso de
 *   criação de contato do CRM (ADR-003) — não há segunda porta de entrada de
 *   pessoas;
 * - toda entrada passa por Zod antes do módulo, que valida de novo;
 * - só atravessa a fronteira texto escrito por nós: nenhuma mensagem do
 *   Postgres, SQLSTATE ou nome de RPC.
 */

const AGENDA_PATH = "/app/agenda";
const TODAY_PATH = "/app/today";

export type AgendaActionResult =
  | { readonly ok: true; readonly id?: string }
  | { readonly ok: false; readonly code: string; readonly message: string };

function failure(code: string): AgendaActionResult {
  return { code, message: schedulingErrorMessage(code), ok: false };
}

const INVALID_INPUT = failure("invalid_input");
const NO_ACTIVE_CLINIC = failure("clinic_unavailable");

/** Única origem do tenant e do fuso: o contexto ativo do servidor. */
async function activeClinic(): Promise<{ id: string; timezone: string } | null> {
  const context = await resolveActiveClinicContext();
  return context.status === "ready"
    ? { id: context.clinic.id, timezone: context.clinic.timezone }
    : null;
}

function revalidateAgenda(): void {
  revalidatePath(AGENDA_PATH);
  revalidatePath(TODAY_PATH);
}

const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const scheduleInputSchema = z.object({
  /** Cliente já existente. Excludente com `newContactName`. */
  contactId: z.uuid().nullable(),
  /** Nome digitado quando o cliente ainda não existe no CRM. */
  newContactName: z.string().trim().min(2).max(160).nullable(),
  professionalId: z.uuid(),
  procedureId: z.uuid().nullable(),
  customProcedureName: z.string().trim().min(2).max(160).nullable(),
  durationMinutes: z.number().int().min(5).max(1440).nullable(),
  priceCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
  day: dayKeySchema,
  time: timeSchema,
  notes: z.string().max(2000).nullable(),
}).strict().refine(
  (value) => (value.contactId === null) !== (value.newContactName === null),
  { message: "Informe um cliente existente ou um nome novo — exatamente um." },
);

export async function scheduleAppointmentAction(input: unknown): Promise<AgendaActionResult> {
  const parsed = scheduleInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const clinic = await activeClinic();
  if (!clinic) return NO_ACTIVE_CLINIC;

  let contactId = parsed.data.contactId;
  if (contactId === null) {
    // Convergência: quem cria pessoas é o CRM, aqui e em qualquer outra tela.
    const created = await createContact({
      clinicId: clinic.id,
      fullName: parsed.data.newContactName,
      idempotencyKey: randomUUID(),
      methods: [],
      linkAsPatient: true,
    });
    if (!created.ok) {
      return failure(created.code === "duplicate" ? "contact_duplicate" : created.code);
    }
    contactId = created.contactId;
  }

  const result = await createAppointment({
    clinicId: clinic.id,
    contactId,
    professionalId: parsed.data.professionalId,
    procedureId: parsed.data.procedureId,
    customProcedureName: parsed.data.customProcedureName,
    startAt: zonedTimeToInstant(parsed.data.day, parsed.data.time, clinic.timezone),
    durationMinutes: parsed.data.durationMinutes,
    priceCents: parsed.data.priceCents,
    notes: parsed.data.notes,
    idempotencyKey: randomUUID(),
  });
  if (!result.ok) return failure(result.code);
  revalidateAgenda();
  return { ok: true, id: result.appointmentId };
}

const statusInputSchema = z.object({
  appointmentId: z.uuid(),
  status: z.enum(APPOINTMENT_STATUSES),
  expectedVersion: z.number().int().min(1),
}).strict();

export async function changeAppointmentStatusAction(input: unknown): Promise<AgendaActionResult> {
  const parsed = statusInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const clinic = await activeClinic();
  if (!clinic) return NO_ACTIVE_CLINIC;

  const result = await updateAppointmentStatus({
    clinicId: clinic.id,
    appointmentId: parsed.data.appointmentId,
    status: parsed.data.status,
    expectedVersion: parsed.data.expectedVersion,
  });
  if (!result.ok) return failure(result.code);
  revalidateAgenda();
  return { ok: true, id: parsed.data.appointmentId };
}

const rescheduleInputSchema = z.object({
  appointmentId: z.uuid(),
  professionalId: z.uuid(),
  day: dayKeySchema,
  time: timeSchema,
  durationMinutes: z.number().int().min(5).max(1440),
  expectedVersion: z.number().int().min(1),
}).strict();

export async function rescheduleAppointmentAction(input: unknown): Promise<AgendaActionResult> {
  const parsed = rescheduleInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const clinic = await activeClinic();
  if (!clinic) return NO_ACTIVE_CLINIC;

  const result = await rescheduleAppointment({
    clinicId: clinic.id,
    appointmentId: parsed.data.appointmentId,
    professionalId: parsed.data.professionalId,
    startAt: zonedTimeToInstant(parsed.data.day, parsed.data.time, clinic.timezone),
    durationMinutes: parsed.data.durationMinutes,
    expectedVersion: parsed.data.expectedVersion,
  });
  if (!result.ok) return failure(result.code);
  revalidateAgenda();
  return { ok: true, id: parsed.data.appointmentId };
}
