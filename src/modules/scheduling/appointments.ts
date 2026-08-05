import "server-only";

import { z } from "zod";

import { createServerSupabaseClient } from "@/shared/db";

import { mapSchedulingError, requireSchedulingAccess } from "./errors";

/**
 * Agendamentos (F4). O contato é sempre um contato já existente do CRM — a
 * criação/deduplicação de pessoas permanece no caso de uso único do módulo
 * `crm` (ADR-003); este módulo apenas referencia o `contactId` resultante.
 * Datas trafegam como ISO-8601 UTC; a formatação no timezone da clínica é
 * responsabilidade exclusiva da interface (ADR-006).
 */

export const APPOINTMENT_STATUSES = [
  "scheduled",
  "confirmed",
  "arrived",
  "in_service",
  "paid",
  "canceled",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

const isoInstantSchema = z.iso.datetime({ offset: true });

export const appointmentIdSchema = z.object({
  clinicId: z.uuid(),
  appointmentId: z.uuid(),
}).strict();

export const listAppointmentsSchema = z.object({
  clinicId: z.uuid(),
  from: isoInstantSchema,
  to: isoInstantSchema,
  professionalId: z.uuid().nullable().default(null),
  contactId: z.uuid().nullable().default(null),
  status: z.enum(APPOINTMENT_STATUSES).nullable().default(null),
  page: z.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.number().int().min(1).max(500).default(500),
}).strict().refine(
  (value) => {
    const from = Date.parse(value.from);
    const to = Date.parse(value.to);
    return to > from && to - from <= 62 * 24 * 60 * 60 * 1000;
  },
  { message: "Intervalo inválido: máximo de 62 dias e fim após o início." },
);

export const createAppointmentSchema = z.object({
  clinicId: z.uuid(),
  contactId: z.uuid(),
  professionalId: z.uuid(),
  procedureId: z.uuid().nullable().default(null),
  customProcedureName: z.string().trim().min(2).max(160).nullable().default(null),
  startAt: isoInstantSchema,
  durationMinutes: z.number().int().min(5).max(1440).nullable().default(null),
  priceCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
  idempotencyKey: z.uuid(),
}).strict().superRefine((value, context) => {
  if ((value.procedureId === null) === (value.customProcedureName === null)) {
    context.addIssue({
      code: "custom",
      message: "Informe um procedimento do catálogo ou um nome livre — exatamente um.",
    });
  }
  if (value.procedureId === null
    && (value.durationMinutes === null || value.priceCents === null)) {
    context.addIssue({
      code: "custom",
      message: "Procedimento livre exige duração e preço explícitos.",
    });
  }
});

export const updateAppointmentStatusSchema = appointmentIdSchema.extend({
  status: z.enum(APPOINTMENT_STATUSES),
  expectedVersion: z.number().int().min(1),
}).strict();

export const rescheduleAppointmentSchema = appointmentIdSchema.extend({
  professionalId: z.uuid(),
  startAt: isoInstantSchema,
  durationMinutes: z.number().int().min(5).max(1440),
  expectedVersion: z.number().int().min(1),
}).strict();

export type AppointmentListItem = {
  readonly id: string;
  readonly contactId: string;
  readonly contactName: string | null;
  readonly professionalId: string;
  readonly professionalName: string;
  readonly professionalColor: string;
  readonly procedureId: string | null;
  readonly procedureName: string;
  readonly startAt: string;
  readonly durationMinutes: number;
  readonly priceCents: number;
  readonly status: AppointmentStatus;
  readonly notes: string | null;
  readonly version: number;
};

export async function listAppointments(input: unknown) {
  const parsed = listAppointmentsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "appointment.view");
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("search_appointments", {
    p_clinic_id: parsed.data.clinicId,
    p_contact_id: parsed.data.contactId,
    p_from: parsed.data.from,
    p_page: parsed.data.page,
    p_page_size: parsed.data.pageSize,
    p_professional_id: parsed.data.professionalId,
    p_status: parsed.data.status,
    p_to: parsed.data.to,
  });
  if (result.error) return { ok: false, code: "unavailable" } as const;
  const items: AppointmentListItem[] = result.data.map((row) => ({
    id: row.id,
    contactId: row.contact_id,
    contactName: row.contact_name,
    professionalId: row.professional_id,
    professionalName: row.professional_name,
    professionalColor: row.professional_color,
    procedureId: row.procedure_id,
    procedureName: row.procedure_name,
    startAt: row.start_at,
    durationMinutes: row.duration_minutes,
    priceCents: row.price_cents,
    status: row.status as AppointmentStatus,
    notes: row.notes,
    version: row.version,
  }));
  return {
    ok: true,
    items,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    total: Number(result.data[0]?.total_count ?? 0),
  } as const;
}

export async function createAppointment(input: unknown) {
  const parsed = createAppointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "appointment.manage", true);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("create_appointment", {
    clinic_id: parsed.data.clinicId,
    contact_id: parsed.data.contactId,
    professional_id: parsed.data.professionalId,
    procedure_id: parsed.data.procedureId,
    custom_procedure_name: parsed.data.customProcedureName,
    start_at: parsed.data.startAt,
    duration_minutes: parsed.data.durationMinutes,
    price_cents: parsed.data.priceCents,
    notes: parsed.data.notes,
    idempotency_key: parsed.data.idempotencyKey,
  });
  if (result.error) return { ok: false, code: mapSchedulingError(result.error) } as const;
  return { ok: true, appointmentId: result.data } as const;
}

export async function updateAppointmentStatus(input: unknown) {
  const parsed = updateAppointmentStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "appointment.manage", true);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("update_appointment_status", {
    clinic_id: parsed.data.clinicId,
    appointment_id: parsed.data.appointmentId,
    new_status: parsed.data.status,
    expected_version: parsed.data.expectedVersion,
  });
  if (result.error) return { ok: false, code: mapSchedulingError(result.error) } as const;
  return { ok: true, version: result.data } as const;
}

export async function rescheduleAppointment(input: unknown) {
  const parsed = rescheduleAppointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "appointment.manage", true);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("reschedule_appointment", {
    clinic_id: parsed.data.clinicId,
    appointment_id: parsed.data.appointmentId,
    professional_id: parsed.data.professionalId,
    start_at: parsed.data.startAt,
    duration_minutes: parsed.data.durationMinutes,
    expected_version: parsed.data.expectedVersion,
  });
  if (result.error) return { ok: false, code: mapSchedulingError(result.error) } as const;
  return { ok: true, version: result.data } as const;
}
