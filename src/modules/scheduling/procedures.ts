import "server-only";

import { z } from "zod";

import { createServerSupabaseClient } from "@/shared/db";

import { mapSchedulingError, requireSchedulingAccess } from "./errors";

const colorSchema = z.string().trim().regex(/^#[0-9A-F]{6}$/i).transform((value) => value.toUpperCase());
const moneySchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const durationSchema = z.number().int().min(5).max(1440);

export const procedureIdSchema = z.object({
  clinicId: z.uuid(),
  procedureId: z.uuid(),
}).strict();

export const createProcedureSchema = z.object({
  clinicId: z.uuid(),
  name: z.string().trim().min(2).max(160),
  description: z.string().max(2000).nullable().default(null),
  category: z.string().trim().min(1).max(100).nullable().default(null),
  defaultDurationMinutes: durationSchema,
  basePriceCents: moneySchema,
  color: colorSchema,
  idempotencyKey: z.uuid(),
}).strict();

export const updateProcedureSchema = createProcedureSchema.omit({ idempotencyKey: true }).extend({
  procedureId: z.uuid(),
  status: z.enum(["active", "inactive"]),
  expectedVersion: z.number().int().min(1),
}).strict();

export const listProceduresSchema = z.object({
  clinicId: z.uuid(),
  search: z.string().trim().max(160).default(""),
  status: z.enum(["active", "inactive"]).nullable().default(null),
  page: z.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
}).strict();

export const setProfessionalProcedureSchema = z.object({
  clinicId: z.uuid(),
  professionalId: z.uuid(),
  procedureId: z.uuid(),
  durationMinutesOverride: durationSchema.nullable().default(null),
  priceCentsOverride: moneySchema.nullable().default(null),
  expectedVersion: z.number().int().min(1).nullable(),
}).strict();

export const archiveProfessionalProcedureSchema = z.object({
  clinicId: z.uuid(),
  professionalProcedureId: z.uuid(),
}).strict();

export const listProfessionalProceduresSchema = z.object({
  clinicId: z.uuid(),
  professionalId: z.uuid().nullable().default(null),
  procedureId: z.uuid().nullable().default(null),
  page: z.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
}).strict();

export function effectiveDuration(
  defaultDurationMinutes: number,
  durationMinutesOverride: number | null,
) {
  return {
    defaultDurationMinutes,
    effectiveDurationMinutes: durationMinutesOverride ?? defaultDurationMinutes,
    hasDurationOverride: durationMinutesOverride !== null,
  } as const;
}

export function effectivePrice(basePriceCents: number, priceCentsOverride: number | null) {
  return {
    basePriceCents,
    effectivePriceCents: priceCentsOverride ?? basePriceCents,
    hasPriceOverride: priceCentsOverride !== null,
  } as const;
}

export async function listProcedures(input: unknown) {
  const parsed = listProceduresSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "procedure.view");
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("search_procedures", {
    p_clinic_id: parsed.data.clinicId,
    p_page: parsed.data.page,
    p_page_size: parsed.data.pageSize,
    p_search_term: parsed.data.search,
    p_status: parsed.data.status,
  });
  if (result.error) return { ok: false, code: "unavailable" } as const;
  let total = Number(result.data[0]?.total_count ?? 0);
  if (result.data.length === 0 && parsed.data.page > 1) {
    const firstPage = await supabase.rpc("search_procedures", {
      p_clinic_id: parsed.data.clinicId,
      p_page: 1,
      p_page_size: 1,
      p_search_term: parsed.data.search,
      p_status: parsed.data.status,
    });
    if (firstPage.error) return { ok: false, code: "unavailable" } as const;
    total = Number(firstPage.data[0]?.total_count ?? 0);
  }
  return {
    ok: true,
    items: result.data.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      defaultDurationMinutes: row.default_duration_minutes,
      basePriceCents: Number(row.base_price_cents),
      color: row.color,
      status: row.status,
    })),
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    total,
  } as const;
}

export async function listActiveProcedures(input: unknown) {
  const parsed = listProceduresSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  return listProcedures({ ...parsed.data, status: "active" });
}

export async function getProcedure(input: unknown) {
  const parsed = procedureIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "procedure.view");
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.from("procedures").select("*")
    .eq("clinic_id", parsed.data.clinicId).eq("id", parsed.data.procedureId).maybeSingle();
  if (result.error) return { ok: false, code: "unavailable" } as const;
  if (!result.data) return { ok: false, code: "procedure_not_found" } as const;
  return {
    ok: true,
    procedure: {
      id: result.data.id,
      name: result.data.name,
      description: result.data.description,
      category: result.data.category,
      defaultDurationMinutes: result.data.default_duration_minutes,
      basePriceCents: Number(result.data.base_price_cents),
      color: result.data.color,
      status: result.data.status,
      version: result.data.version,
      createdAt: result.data.created_at,
      updatedAt: result.data.updated_at,
      archivedAt: result.data.archived_at,
    },
  } as const;
}

export async function listProfessionalProcedures(input: unknown) {
  const parsed = listProfessionalProceduresSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const [professionalAccess, procedureAccess] = await Promise.all([
    requireSchedulingAccess(parsed.data.clinicId, "professional.view"),
    requireSchedulingAccess(parsed.data.clinicId, "procedure.view"),
  ]);
  if (!professionalAccess.ok) return professionalAccess;
  if (!procedureAccess.ok) return procedureAccess;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("search_professional_procedures", {
    p_clinic_id: parsed.data.clinicId,
    p_page: parsed.data.page,
    p_page_size: parsed.data.pageSize,
    p_procedure_id: parsed.data.procedureId,
    p_professional_id: parsed.data.professionalId,
  });
  if (result.error) return { ok: false, code: "unavailable" } as const;
  let total = Number(result.data[0]?.total_count ?? 0);
  if (result.data.length === 0 && parsed.data.page > 1) {
    const firstPage = await supabase.rpc("search_professional_procedures", {
      p_clinic_id: parsed.data.clinicId,
      p_page: 1,
      p_page_size: 1,
      p_procedure_id: parsed.data.procedureId,
      p_professional_id: parsed.data.professionalId,
    });
    if (firstPage.error) return { ok: false, code: "unavailable" } as const;
    total = Number(firstPage.data[0]?.total_count ?? 0);
  }
  return {
    ok: true,
    items: result.data.map((row) => ({
      id: row.id,
      professionalId: row.professional_id,
      procedureId: row.procedure_id,
      professionalName: row.professional_name,
      procedureName: row.procedure_name,
      defaultDurationMinutes: row.default_duration_minutes,
      effectiveDurationMinutes: row.effective_duration_minutes,
      hasDurationOverride: row.has_duration_override,
      basePriceCents: Number(row.base_price_cents),
      effectivePriceCents: Number(row.effective_price_cents),
      hasPriceOverride: row.has_price_override,
      version: row.version,
    })),
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    total,
  } as const;
}

export async function createProcedure(input: unknown) {
  const parsed = createProcedureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "procedure.manage", true);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("create_procedure", {
    clinic_id: parsed.data.clinicId,
    name: parsed.data.name,
    description: parsed.data.description,
    category: parsed.data.category,
    default_duration_minutes: parsed.data.defaultDurationMinutes,
    base_price_cents: parsed.data.basePriceCents,
    color: parsed.data.color,
    idempotency_key: parsed.data.idempotencyKey,
  });
  if (result.error) return { ok: false, code: mapSchedulingError(result.error) } as const;
  return { ok: true, procedureId: result.data } as const;
}

export async function updateProcedure(input: unknown) {
  const parsed = updateProcedureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "procedure.manage", true);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("update_procedure", {
    clinic_id: parsed.data.clinicId,
    procedure_id: parsed.data.procedureId,
    name: parsed.data.name,
    description: parsed.data.description,
    category: parsed.data.category,
    default_duration_minutes: parsed.data.defaultDurationMinutes,
    base_price_cents: parsed.data.basePriceCents,
    color: parsed.data.color,
    status: parsed.data.status,
    expected_version: parsed.data.expectedVersion,
  });
  if (result.error) return { ok: false, code: mapSchedulingError(result.error) } as const;
  return { ok: true, version: result.data } as const;
}

export async function archiveProcedure(input: unknown) {
  const parsed = procedureIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "procedure.manage", true);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("archive_procedure", {
    clinic_id: parsed.data.clinicId,
    procedure_id: parsed.data.procedureId,
  });
  if (result.error) return { ok: false, code: mapSchedulingError(result.error) } as const;
  return { ok: true } as const;
}

export async function setProfessionalProcedure(input: unknown) {
  const parsed = setProfessionalProcedureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const [professionalAccess, procedureAccess] = await Promise.all([
    requireSchedulingAccess(parsed.data.clinicId, "professional.manage", true),
    requireSchedulingAccess(parsed.data.clinicId, "procedure.manage", true),
  ]);
  if (!professionalAccess.ok) return professionalAccess;
  if (!procedureAccess.ok) return procedureAccess;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("set_professional_procedure", {
    clinic_id: parsed.data.clinicId,
    professional_id: parsed.data.professionalId,
    procedure_id: parsed.data.procedureId,
    duration_minutes_override: parsed.data.durationMinutesOverride,
    price_cents_override: parsed.data.priceCentsOverride,
    expected_version: parsed.data.expectedVersion,
  });
  if (result.error) return { ok: false, code: mapSchedulingError(result.error) } as const;
  return { ok: true, professionalProcedureId: result.data } as const;
}

export async function archiveProfessionalProcedure(input: unknown) {
  const parsed = archiveProfessionalProcedureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const [professionalAccess, procedureAccess] = await Promise.all([
    requireSchedulingAccess(parsed.data.clinicId, "professional.manage", true),
    requireSchedulingAccess(parsed.data.clinicId, "procedure.manage", true),
  ]);
  if (!professionalAccess.ok) return professionalAccess;
  if (!procedureAccess.ok) return procedureAccess;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("archive_professional_procedure", {
    clinic_id: parsed.data.clinicId,
    professional_procedure_id: parsed.data.professionalProcedureId,
  });
  if (result.error) return { ok: false, code: mapSchedulingError(result.error) } as const;
  return { ok: true } as const;
}
