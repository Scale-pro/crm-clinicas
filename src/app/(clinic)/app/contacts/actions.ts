"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addContactMethod,
  archiveContact,
  archiveContactMethod,
  assignContactOwner,
  createContact,
  linkContactAsPatient,
  setPrimaryContactMethod,
  unlinkContactAsPatient,
  updateContact,
  updateContactMethod,
} from "@/modules/crm";
import { resolveActiveClinicContext } from "@/modules/tenancy";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function checked(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

async function activeClinic(formData: FormData, fallback: string) {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready" || field(formData, "clinicId") !== context.clinic.id) {
    redirect(`${fallback}?error=forbidden`);
  }
  return context.clinic.id;
}

function editPath(contactId: string, code?: string) {
  const base = `/app/contacts/${encodeURIComponent(contactId)}/edit`;
  return code ? `${base}?error=${encodeURIComponent(code)}` : base;
}

export async function createContactFormAction(formData: FormData) {
  const clinicId = await activeClinic(formData, "/app/contacts/new");
  const phone = field(formData, "phone");
  const email = field(formData, "email");
  const methods = [
    ...(phone
      ? [{ kind: "phone" as const, rawValue: phone, isPrimary: true, isWhatsapp: checked(formData, "isWhatsapp") }]
      : []),
    ...(email ? [{ kind: "email" as const, rawValue: email, isPrimary: true }] : []),
  ];
  const result = await createContact({
    clinicId,
    fullName: field(formData, "fullName"),
    notes: field(formData, "notes") || null,
    idempotencyKey: field(formData, "idempotencyKey"),
    methods,
    linkAsPatient: checked(formData, "linkAsPatient"),
  });
  if (!result.ok) {
    const existingId = "conflictingContactId" in result
      ? result.conflictingContactId
      : null;
    const existing = existingId
      ? `&existing=${encodeURIComponent(existingId)}`
      : "";
    redirect(`/app/contacts/new?error=${result.code}${existing}`);
  }
  revalidatePath("/app/contacts");
  redirect(`/app/contacts/${result.contactId}?status=created`);
}

export async function updateContactFormAction(formData: FormData) {
  const contactId = field(formData, "contactId");
  const clinicId = await activeClinic(formData, editPath(contactId));
  const result = await updateContact({
    clinicId,
    contactId,
    fullName: field(formData, "fullName"),
    notes: field(formData, "notes") || null,
    expectedVersion: Number(field(formData, "expectedVersion")),
  });
  if (!result.ok) redirect(editPath(contactId, result.code));
  revalidatePath(`/app/contacts/${contactId}`);
  redirect(`/app/contacts/${contactId}?status=updated`);
}

export async function archiveContactFormAction(formData: FormData) {
  const contactId = field(formData, "contactId");
  const clinicId = await activeClinic(formData, `/app/contacts/${contactId}`);
  const result = await archiveContact({ clinicId, contactId });
  if (!result.ok) redirect(`/app/contacts/${contactId}?error=${result.code}`);
  revalidatePath("/app/contacts");
  redirect(`/app/contacts/${contactId}?status=archived`);
}

export async function assignContactOwnerFormAction(formData: FormData) {
  const contactId = field(formData, "contactId");
  const clinicId = await activeClinic(formData, editPath(contactId));
  const result = await assignContactOwner({
    clinicId,
    contactId,
    ownerUserId: field(formData, "ownerUserId"),
  });
  if (!result.ok) redirect(editPath(contactId, result.code));
  revalidatePath(`/app/contacts/${contactId}`);
  redirect(editPath(contactId));
}

export async function addContactMethodFormAction(formData: FormData) {
  const contactId = field(formData, "contactId");
  const clinicId = await activeClinic(formData, editPath(contactId));
  const result = await addContactMethod({
    clinicId,
    contactId,
    kind: field(formData, "kind"),
    rawValue: field(formData, "rawValue"),
    label: field(formData, "label") || null,
    isPrimary: checked(formData, "isPrimary"),
    isWhatsapp: checked(formData, "isWhatsapp"),
  });
  if (!result.ok) {
    const existingId = "conflictingContactId" in result
      ? result.conflictingContactId
      : null;
    const existing = existingId
      ? `&existing=${encodeURIComponent(existingId)}`
      : "";
    redirect(`${editPath(contactId, result.code)}${existing}`);
  }
  revalidatePath(`/app/contacts/${contactId}`);
  redirect(editPath(contactId));
}

export async function updateContactMethodFormAction(formData: FormData) {
  const contactId = field(formData, "contactId");
  const clinicId = await activeClinic(formData, editPath(contactId));
  const result = await updateContactMethod({
    clinicId,
    contactMethodId: field(formData, "contactMethodId"),
    kind: field(formData, "kind"),
    rawValue: field(formData, "rawValue"),
    label: field(formData, "label") || null,
    isWhatsapp: checked(formData, "isWhatsapp"),
  });
  if (!result.ok) redirect(editPath(contactId, result.code));
  revalidatePath(`/app/contacts/${contactId}`);
  redirect(editPath(contactId));
}

export async function archiveContactMethodFormAction(formData: FormData) {
  const contactId = field(formData, "contactId");
  const clinicId = await activeClinic(formData, editPath(contactId));
  const result = await archiveContactMethod({
    clinicId,
    contactMethodId: field(formData, "contactMethodId"),
  });
  if (!result.ok) redirect(editPath(contactId, result.code));
  revalidatePath(`/app/contacts/${contactId}`);
  redirect(editPath(contactId));
}

export async function setPrimaryContactMethodFormAction(formData: FormData) {
  const contactId = field(formData, "contactId");
  const clinicId = await activeClinic(formData, editPath(contactId));
  const result = await setPrimaryContactMethod({
    clinicId,
    contactMethodId: field(formData, "contactMethodId"),
  });
  if (!result.ok) redirect(editPath(contactId, result.code));
  revalidatePath(`/app/contacts/${contactId}`);
  redirect(editPath(contactId));
}

export async function changePatientLinkFormAction(formData: FormData) {
  const contactId = field(formData, "contactId");
  const clinicId = await activeClinic(formData, editPath(contactId));
  const result = checked(formData, "link")
    ? await linkContactAsPatient({ clinicId, contactId })
    : await unlinkContactAsPatient({ clinicId, contactId });
  if (!result.ok) redirect(editPath(contactId, result.code));
  revalidatePath(`/app/contacts/${contactId}`);
  redirect(editPath(contactId));
}
