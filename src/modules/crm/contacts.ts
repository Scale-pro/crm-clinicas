import "server-only";

import { z } from "zod";

import { requirePermission } from "@/shared/auth";
import { createServerSupabaseClient } from "@/shared/db";

import { normalizeContactMethod } from "./phone";

type DatabaseError = { code?: string; message?: string };
export type CrmErrorCode =
  | "conflict"
  | "duplicate"
  | "forbidden"
  | "invalid_input"
  | "not_found"
  | "unavailable";

export function mapCrmError(error: DatabaseError): CrmErrorCode {
  if (error.code === "23505") return "duplicate";
  if (error.code === "40001") return "conflict";
  if (error.code === "42501") return "forbidden";
  if (error.code === "22023" || error.code === "23514") return "invalid_input";
  if (error.code === "P0002") return "not_found";
  return "unavailable";
}

export async function resolveContactScope(clinicId: string) {
  const all = await requirePermission(clinicId, "contact.view_all");
  if (all.allowed) return { ok: true, scope: "all" } as const;
  const own = await requirePermission(clinicId, "contact.view_own");
  if (own.allowed) return { ok: true, scope: "own", userId: own.session.userId } as const;
  return { ok: false, code: "forbidden" } as const;
}

export async function requireContactEditAccess(clinicId: string, contactId: string) {
  const all = await requirePermission(clinicId, "contact.edit_all");
  if (all.allowed) return { ok: true, scope: "all" } as const;
  const own = await requirePermission(clinicId, "contact.edit_own");
  if (!own.allowed) return { ok: false, code: "forbidden" } as const;
  const supabase = await createServerSupabaseClient();
  const contact = await supabase
    .from("contacts")
    .select("owner_user_id")
    .eq("clinic_id", clinicId)
    .eq("id", contactId)
    .maybeSingle();
  if (contact.error) return { ok: false, code: "unavailable" } as const;
  if (!contact.data) return { ok: false, code: "not_found" } as const;
  if (contact.data.owner_user_id !== own.session.userId) {
    return { ok: false, code: "forbidden" } as const;
  }
  return { ok: true, scope: "own" } as const;
}

const listSchema = z
  .object({
    clinicId: z.uuid(),
    search: z.string().trim().max(160).default(""),
    ownerUserId: z.uuid().nullable().optional(),
    includeArchived: z.boolean().default(false),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();

export async function listContacts(input: unknown) {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const scope = await resolveContactScope(parsed.data.clinicId);
  if (!scope.ok) return scope;
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("contacts")
    .select("id,full_name,owner_user_id,notes,archived_at,version,created_at")
    .eq("clinic_id", parsed.data.clinicId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (!parsed.data.includeArchived) query = query.is("archived_at", null);
  if (parsed.data.ownerUserId) query = query.eq("owner_user_id", parsed.data.ownerUserId);
  const contacts = await query;
  if (contacts.error) return { ok: false, code: "unavailable" } as const;

  const search = parsed.data.search.toLocaleLowerCase("pt-BR");
  let methodContactIds = new Set<string>();
  if (search) {
    const phone = normalizeContactMethod("phone", parsed.data.search);
    const email = normalizeContactMethod("email", parsed.data.search);
    const normalized = phone ?? email;
    if (normalized) {
      const methods = await supabase
        .from("person_contacts")
        .select("contact_id")
        .eq("clinic_id", parsed.data.clinicId)
        .eq("normalized_value", normalized)
        .is("archived_at", null);
      if (methods.error) return { ok: false, code: "unavailable" } as const;
      methodContactIds = new Set(methods.data.map((method) => method.contact_id));
    }
  }
  const filtered = contacts.data
    .filter(
      (contact) =>
        !search ||
        contact.full_name.toLocaleLowerCase("pt-BR").includes(search) ||
        methodContactIds.has(contact.id),
    )
    .slice(0, parsed.data.limit);
  return { ok: true, contacts: filtered, scope: scope.scope } as const;
}

const contactIdSchema = z.object({ clinicId: z.uuid(), contactId: z.uuid() }).strict();

export async function getContact(input: unknown) {
  const parsed = contactIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const scope = await resolveContactScope(parsed.data.clinicId);
  if (!scope.ok) return scope;
  const supabase = await createServerSupabaseClient();
  const [contact, methods, patient, activities] = await Promise.all([
    supabase.from("contacts").select("*").eq("clinic_id", parsed.data.clinicId).eq("id", parsed.data.contactId).maybeSingle(),
    supabase.from("person_contacts").select("*").eq("clinic_id", parsed.data.clinicId).eq("contact_id", parsed.data.contactId).order("kind").order("created_at"),
    supabase.from("patients").select("became_patient_at").eq("clinic_id", parsed.data.clinicId).eq("contact_id", parsed.data.contactId).maybeSingle(),
    supabase.from("activities").select("id,type,payload,occurred_at,actor_id").eq("clinic_id", parsed.data.clinicId).eq("contact_id", parsed.data.contactId).order("occurred_at", { ascending: false }).limit(20),
  ]);
  if (contact.error || methods.error || patient.error || activities.error) {
    return { ok: false, code: "unavailable" } as const;
  }
  if (!contact.data) return { ok: false, code: "not_found" } as const;
  return {
    ok: true,
    contact: contact.data,
    methods: methods.data,
    patient: patient.data,
    activities: activities.data,
    scope: scope.scope,
  } as const;
}

const initialMethodSchema = z
  .object({
    kind: z.enum(["phone", "email"]),
    rawValue: z.string().min(3).max(320),
    label: z.string().trim().min(1).max(40).nullable().optional(),
    isPrimary: z.boolean().default(true),
    isWhatsapp: z.boolean().default(false),
  })
  .strict();

export const createContactSchema = z
  .object({
    clinicId: z.uuid(),
    fullName: z.string().trim().min(2).max(160),
    notes: z.string().max(2000).nullable().optional(),
    idempotencyKey: z.uuid(),
    methods: z.array(initialMethodSchema).max(10).default([]),
    linkAsPatient: z.boolean().default(false),
  })
  .strict();

export async function createContact(input: unknown) {
  const parsed = createContactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const permission = await requirePermission(parsed.data.clinicId, "contact.create");
  if (!permission.allowed) return { ok: false, code: "forbidden" } as const;
  const methods = parsed.data.methods.map((method) => ({
    kind: method.kind,
    raw_value: method.rawValue,
    normalized_value: normalizeContactMethod(method.kind, method.rawValue),
    label: method.label ?? null,
    is_primary: method.isPrimary,
    is_whatsapp: method.isWhatsapp,
  }));
  if (methods.some((method) => !method.normalized_value)) {
    return { ok: false, code: "invalid_input" } as const;
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_contact", {
    clinic_id: parsed.data.clinicId,
    full_name: parsed.data.fullName,
    notes: parsed.data.notes ?? null,
    idempotency_key: parsed.data.idempotencyKey,
    methods,
    link_as_patient: parsed.data.linkAsPatient,
  });
  if (error) return { ok: false, code: mapCrmError(error) } as const;
  return { ok: true, contactId: data } as const;
}

export const updateContactSchema = z
  .object({
    clinicId: z.uuid(),
    contactId: z.uuid(),
    fullName: z.string().trim().min(2).max(160),
    notes: z.string().max(2000).nullable(),
    expectedVersion: z.number().int().min(1),
  })
  .strict();

export async function updateContact(input: unknown) {
  const parsed = updateContactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireContactEditAccess(parsed.data.clinicId, parsed.data.contactId);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("update_contact", {
    clinic_id: parsed.data.clinicId,
    contact_id: parsed.data.contactId,
    full_name: parsed.data.fullName,
    notes: parsed.data.notes,
    expected_version: parsed.data.expectedVersion,
  });
  if (error) return { ok: false, code: mapCrmError(error) } as const;
  return { ok: true, version: data } as const;
}

export async function archiveContact(input: unknown) {
  const parsed = contactIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const permission = await requirePermission(parsed.data.clinicId, "contact.archive");
  if (!permission.allowed) return { ok: false, code: "forbidden" } as const;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("archive_contact", {
    clinic_id: parsed.data.clinicId,
    contact_id: parsed.data.contactId,
  });
  if (error) return { ok: false, code: mapCrmError(error) } as const;
  return { ok: true } as const;
}

const assignOwnerSchema = contactIdSchema.extend({ ownerUserId: z.uuid() }).strict();
export async function assignContactOwner(input: unknown) {
  const parsed = assignOwnerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const permission = await requirePermission(parsed.data.clinicId, "contact.edit_all");
  if (!permission.allowed) return { ok: false, code: "forbidden" } as const;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("assign_contact_owner", {
    clinic_id: parsed.data.clinicId,
    contact_id: parsed.data.contactId,
    owner_user_id: parsed.data.ownerUserId,
  });
  if (error) return { ok: false, code: mapCrmError(error) } as const;
  return { ok: true } as const;
}
