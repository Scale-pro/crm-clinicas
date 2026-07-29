import "server-only";

import { z } from "zod";

import { createServerSupabaseClient } from "@/shared/db";
import { normalizeBrazilianPhone } from "@/shared/lib/contact-method";

import { mapSchedulingError, requireSchedulingAccess } from "./errors";

const colorSchema = z.string().trim().regex(/^#[0-9A-F]{6}$/i).transform((value) => value.toUpperCase());
const nullableEmailSchema = z.email().trim().toLowerCase().max(320).nullable();
const nullablePhoneSchema = z.string().trim().min(8).max(32).nullable().refine(
  (value) => value === null || normalizeBrazilianPhone(value) !== null,
  { message: "Telefone inválido." },
);
const nullableRegistrationTypeSchema = z.string().trim().min(2).max(40).nullable();
const nullableRegistrationNumberSchema = z.string().trim().min(1).max(80).nullable();

export const professionalIdSchema = z.object({
  clinicId: z.uuid(),
  professionalId: z.uuid(),
}).strict();

export const createProfessionalSchema = z.object({
  clinicId: z.uuid(),
  displayName: z.string().trim().min(2).max(160),
  email: nullableEmailSchema.default(null),
  phone: nullablePhoneSchema.default(null),
  professionalRegistrationType: nullableRegistrationTypeSchema.default(null),
  professionalRegistrationNumber: nullableRegistrationNumberSchema.default(null),
  color: colorSchema,
  notes: z.string().max(2000).nullable().default(null),
  idempotencyKey: z.uuid(),
}).strict();

export const updateProfessionalSchema = createProfessionalSchema.omit({ idempotencyKey: true }).extend({
  professionalId: z.uuid(),
  status: z.enum(["active", "inactive"]),
  expectedVersion: z.number().int().min(1),
}).strict();

export const listProfessionalsSchema = z.object({
  clinicId: z.uuid(),
  search: z.string().trim().max(160).default(""),
  status: z.enum(["active", "inactive"]).nullable().default(null),
  specialty: z.string().trim().min(2).max(80).nullable().default(null),
  page: z.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
}).strict();

export const setProfessionalSpecialtiesSchema = professionalIdSchema.extend({
  specialties: z.array(z.string().trim().min(2).max(80)).max(20).superRefine((items, context) => {
    const normalized = items.map((item) => item.toLocaleLowerCase("pt-BR"));
    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({ code: "custom", message: "Especialidades duplicadas." });
    }
  }),
}).strict();

export const linkProfessionalUserSchema = professionalIdSchema.extend({
  userId: z.uuid(),
}).strict();

export async function listProfessionals(input: unknown) {
  const parsed = listProfessionalsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "professional.view");
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("search_professionals", {
    p_clinic_id: parsed.data.clinicId,
    p_page: parsed.data.page,
    p_page_size: parsed.data.pageSize,
    p_search_term: parsed.data.search,
    p_specialty: parsed.data.specialty,
    p_status: parsed.data.status,
  });
  if (result.error) return { ok: false, code: "unavailable" } as const;
  let total = Number(result.data[0]?.total_count ?? 0);
  if (result.data.length === 0 && parsed.data.page > 1) {
    const firstPage = await supabase.rpc("search_professionals", {
      p_clinic_id: parsed.data.clinicId,
      p_page: 1,
      p_page_size: 1,
      p_search_term: parsed.data.search,
      p_specialty: parsed.data.specialty,
      p_status: parsed.data.status,
    });
    if (firstPage.error) return { ok: false, code: "unavailable" } as const;
    total = Number(firstPage.data[0]?.total_count ?? 0);
  }
  return {
    ok: true,
    items: result.data.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      color: row.color,
      status: row.status,
      specialties: row.specialties,
    })),
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    total,
  } as const;
}

export async function listActiveProfessionals(input: unknown) {
  const parsed = listProfessionalsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  return listProfessionals({ ...parsed.data, status: "active" });
}

export async function getProfessional(input: unknown) {
  const parsed = professionalIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "professional.view");
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const [professional, specialties] = await Promise.all([
    supabase.from("professionals").select("*")
      .eq("clinic_id", parsed.data.clinicId).eq("id", parsed.data.professionalId).maybeSingle(),
    supabase.from("professional_specialties").select("id,name,created_at")
      .eq("clinic_id", parsed.data.clinicId).eq("professional_id", parsed.data.professionalId)
      .order("name").order("id"),
  ]);
  if (professional.error || specialties.error) return { ok: false, code: "unavailable" } as const;
  if (!professional.data) return { ok: false, code: "professional_not_found" } as const;
  return {
    ok: true,
    professional: {
      id: professional.data.id,
      userId: professional.data.user_id,
      displayName: professional.data.display_name,
      email: professional.data.email,
      phone: professional.data.phone,
      professionalRegistrationType: professional.data.professional_registration_type,
      professionalRegistrationNumber: professional.data.professional_registration_number,
      color: professional.data.color,
      status: professional.data.status,
      notes: professional.data.notes,
      version: professional.data.version,
      createdAt: professional.data.created_at,
      updatedAt: professional.data.updated_at,
      archivedAt: professional.data.archived_at,
      specialties: specialties.data.map((item) => item.name),
    },
  } as const;
}

export async function createProfessional(input: unknown) {
  const parsed = createProfessionalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "professional.manage", true);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("create_professional", {
    clinic_id: parsed.data.clinicId,
    display_name: parsed.data.displayName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    professional_registration_type: parsed.data.professionalRegistrationType,
    professional_registration_number: parsed.data.professionalRegistrationNumber,
    color: parsed.data.color,
    notes: parsed.data.notes,
    idempotency_key: parsed.data.idempotencyKey,
  });
  if (result.error) return { ok: false, code: mapSchedulingError(result.error) } as const;
  return { ok: true, professionalId: result.data } as const;
}

export async function updateProfessional(input: unknown) {
  const parsed = updateProfessionalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "professional.manage", true);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("update_professional", {
    clinic_id: parsed.data.clinicId,
    professional_id: parsed.data.professionalId,
    display_name: parsed.data.displayName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    professional_registration_type: parsed.data.professionalRegistrationType,
    professional_registration_number: parsed.data.professionalRegistrationNumber,
    color: parsed.data.color,
    status: parsed.data.status,
    notes: parsed.data.notes,
    expected_version: parsed.data.expectedVersion,
  });
  if (result.error) return { ok: false, code: mapSchedulingError(result.error) } as const;
  return { ok: true, version: result.data } as const;
}

export async function archiveProfessional(input: unknown) {
  const parsed = professionalIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "professional.manage", true);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("archive_professional", {
    clinic_id: parsed.data.clinicId,
    professional_id: parsed.data.professionalId,
  });
  if (result.error) return { ok: false, code: mapSchedulingError(result.error) } as const;
  return { ok: true } as const;
}

export async function setProfessionalSpecialties(input: unknown) {
  const parsed = setProfessionalSpecialtiesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "professional.manage", true);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("set_professional_specialties", {
    clinic_id: parsed.data.clinicId,
    professional_id: parsed.data.professionalId,
    specialties: parsed.data.specialties,
  });
  if (result.error) return { ok: false, code: mapSchedulingError(result.error) } as const;
  return { ok: true } as const;
}

export async function linkProfessionalUser(input: unknown) {
  const parsed = linkProfessionalUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "professional.manage", true);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("link_professional_user", {
    clinic_id: parsed.data.clinicId,
    professional_id: parsed.data.professionalId,
    linked_user_id: parsed.data.userId,
  });
  if (result.error) return { ok: false, code: mapSchedulingError(result.error) } as const;
  return { ok: true } as const;
}

export async function unlinkProfessionalUser(input: unknown) {
  const parsed = professionalIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "professional.manage", true);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("unlink_professional_user", {
    clinic_id: parsed.data.clinicId,
    professional_id: parsed.data.professionalId,
  });
  if (result.error) return { ok: false, code: mapSchedulingError(result.error) } as const;
  return { ok: true } as const;
}
