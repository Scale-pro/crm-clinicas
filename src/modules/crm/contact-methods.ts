import "server-only";

import { z } from "zod";

import { requirePermission } from "@/shared/auth";
import { createServerSupabaseClient } from "@/shared/db";
import { normalizeContactMethod } from "@/shared/lib/contact-method";

import {
  conflictingContactId,
  mapCrmError,
  requireContactEditAccess,
} from "./contacts";

export const contactMethodSchema = z
  .object({
    clinicId: z.uuid(),
    contactId: z.uuid(),
    kind: z.enum(["phone", "email"]),
    rawValue: z.string().min(3).max(320),
    label: z.string().trim().min(1).max(40).nullable().optional(),
    isPrimary: z.boolean().default(false),
    isWhatsapp: z.boolean().default(false),
  })
  .strict()
  .refine((value) => value.kind === "phone" || !value.isWhatsapp, {
    message: "Somente telefones podem ser WhatsApp.",
  });

export async function addContactMethod(input: unknown) {
  const parsed = contactMethodSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const normalizedValue = normalizeContactMethod(parsed.data.kind, parsed.data.rawValue);
  if (!normalizedValue) return { ok: false, code: "invalid_input" } as const;
  const access = await requireContactEditAccess(parsed.data.clinicId, parsed.data.contactId);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("add_contact_method", {
    clinic_id: parsed.data.clinicId,
    contact_id: parsed.data.contactId,
    kind: parsed.data.kind,
    raw_value: parsed.data.rawValue,
    normalized_value: normalizedValue,
    label: parsed.data.label ?? null,
    is_primary: parsed.data.isPrimary,
    is_whatsapp: parsed.data.isWhatsapp,
  });
  if (error) {
    return {
      ok: false,
      code: mapCrmError(error),
      conflictingContactId: conflictingContactId(error),
    } as const;
  }
  return { ok: true, contactMethodId: data } as const;
}

const updateContactMethodSchema = z
  .object({
    clinicId: z.uuid(),
    contactMethodId: z.uuid(),
    kind: z.enum(["phone", "email"]),
    rawValue: z.string().min(3).max(320),
    label: z.string().trim().min(1).max(40).nullable().optional(),
    isWhatsapp: z.boolean().default(false),
  })
  .strict()
  .refine((value) => value.kind === "phone" || !value.isWhatsapp, {
    message: "Somente telefones podem ser WhatsApp.",
  });

export async function updateContactMethod(input: unknown) {
  const parsed = updateContactMethodSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const normalizedValue = normalizeContactMethod(parsed.data.kind, parsed.data.rawValue);
  if (!normalizedValue) return { ok: false, code: "invalid_input" } as const;
  const supabase = await createServerSupabaseClient();
  const method = await supabase
    .from("person_contacts")
    .select("contact_id")
    .eq("clinic_id", parsed.data.clinicId)
    .eq("id", parsed.data.contactMethodId)
    .maybeSingle();
  if (method.error || !method.data) return { ok: false, code: "not_found" } as const;
  const access = await requireContactEditAccess(parsed.data.clinicId, method.data.contact_id);
  if (!access.ok) return access;
  const result = await supabase.rpc("update_contact_method", {
    clinic_id: parsed.data.clinicId,
    contact_method_id: parsed.data.contactMethodId,
    kind: parsed.data.kind,
    raw_value: parsed.data.rawValue,
    normalized_value: normalizedValue,
    label: parsed.data.label ?? null,
    is_whatsapp: parsed.data.isWhatsapp,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true } as const;
}

const methodMutationSchema = z
  .object({ clinicId: z.uuid(), contactMethodId: z.uuid() })
  .strict();

export async function archiveContactMethod(input: unknown) {
  const parsed = methodMutationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const supabase = await createServerSupabaseClient();
  const method = await supabase
    .from("person_contacts")
    .select("contact_id")
    .eq("clinic_id", parsed.data.clinicId)
    .eq("id", parsed.data.contactMethodId)
    .maybeSingle();
  if (method.error || !method.data) return { ok: false, code: "not_found" } as const;
  const access = await requireContactEditAccess(parsed.data.clinicId, method.data.contact_id);
  if (!access.ok) return access;
  const result = await supabase.rpc("archive_contact_method", {
    clinic_id: parsed.data.clinicId,
    contact_method_id: parsed.data.contactMethodId,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true } as const;
}

export async function setPrimaryContactMethod(input: unknown) {
  const parsed = methodMutationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const permission = await requirePermission(parsed.data.clinicId, "contact.edit_own");
  const allPermission = await requirePermission(parsed.data.clinicId, "contact.edit_all");
  if (!permission.allowed && !allPermission.allowed) {
    return { ok: false, code: "forbidden" } as const;
  }
  const supabase = await createServerSupabaseClient();
  const method = await supabase
    .from("person_contacts")
    .select("contact_id")
    .eq("clinic_id", parsed.data.clinicId)
    .eq("id", parsed.data.contactMethodId)
    .maybeSingle();
  if (method.error || !method.data) return { ok: false, code: "not_found" } as const;
  const access = await requireContactEditAccess(parsed.data.clinicId, method.data.contact_id);
  if (!access.ok) return access;
  const result = await supabase.rpc("set_primary_contact_method", {
    clinic_id: parsed.data.clinicId,
    contact_method_id: parsed.data.contactMethodId,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true } as const;
}
