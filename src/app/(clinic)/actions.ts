"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  removeOwnTotpFactor,
  updateOwnPassword,
} from "@/modules/identity";
import {
  inviteClinicMember,
  resolveActiveClinicContext,
  selectActiveClinic,
  updateClinicSettings,
} from "@/modules/tenancy";
import { safeInternalRedirect } from "@/shared/auth";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function selectClinicFormAction(formData: FormData) {
  const result = await selectActiveClinic({
    clinicId: field(formData, "clinicId"),
    next: safeInternalRedirect(field(formData, "next"), "/app"),
  });
  if (!result.ok) redirect(`/select-clinic?error=${result.code}`);
  redirect(result.redirectTo);
}

export async function updateClinicSettingsFormAction(formData: FormData) {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") redirect("/app?error=context_unavailable");
  const requestedClinicId = field(formData, "clinicId");
  if (requestedClinicId !== context.clinic.id) redirect("/app/settings?error=forbidden");
  const result = await updateClinicSettings({
    clinicId: context.clinic.id,
    name: field(formData, "name"),
    timezone: field(formData, "timezone"),
  });
  if (!result.ok) redirect(`/app/settings?error=${result.code}`);
  revalidatePath("/app", "layout");
  redirect("/app/settings?status=updated");
}

export async function updatePasswordFormAction(formData: FormData) {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") redirect("/login?next=%2Fapp%2Faccount");
  const result = await updateOwnPassword(field(formData, "password"));
  if (!result.ok) redirect(`/app/account?error=${result.code}`);
  redirect("/app/account?status=password_updated");
}

export async function removeMfaFormAction(formData: FormData) {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") redirect("/login?next=%2Fapp%2Fsecurity");
  const result = await removeOwnTotpFactor(field(formData, "factorId"));
  if (!result.ok) redirect(`/app/security?error=${result.code}`);
  redirect("/app/security?status=factor_removed");
}

export type InviteMemberState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "created"; readonly link: string };

export async function inviteMemberFormAction(
  _previous: InviteMemberState,
  formData: FormData,
): Promise<InviteMemberState> {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready" || field(formData, "clinicId") !== context.clinic.id) {
    return { status: "error", message: "A clínica ativa não pôde ser validada." };
  }
  const result = await inviteClinicMember({
    clinicId: context.clinic.id,
    email: field(formData, "email"),
    expiresInHours: 72,
    role: field(formData, "role"),
  });
  if (!result.ok) {
    return { status: "error", message: "Não foi possível criar o convite." };
  }
  return { status: "created", link: result.link };
}
