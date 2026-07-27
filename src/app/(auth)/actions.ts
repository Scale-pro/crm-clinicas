"use server";

import { redirect } from "next/navigation";

import {
  enrollTotp,
  loginWithPassword,
  registerAccount,
  requestPasswordReset,
  updateOwnPassword,
  verifyTotp,
} from "@/modules/identity";
import {
  acceptClinicInvitation,
  createInitialClinic,
  selectActiveClinic,
} from "@/modules/tenancy";
import { safeInternalRedirect } from "@/shared/auth";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function failure(path: string, code: string): never {
  const url = new URL(path, "https://local.invalid");
  url.searchParams.set("error", code);
  redirect(`${url.pathname}${url.search}`);
}

export async function loginFormAction(formData: FormData) {
  const next = safeInternalRedirect(field(formData, "next"), "/app");
  const result = await loginWithPassword(
    { email: field(formData, "email"), password: field(formData, "password") },
    next,
  );
  if (!result.ok) failure("/login", result.code);
  if (result.next !== "authenticated") {
    redirect(`/mfa?next=${encodeURIComponent(result.redirectTo)}`);
  }
  redirect(result.redirectTo);
}

export async function registerFormAction(formData: FormData) {
  const result = await registerAccount({
    email: field(formData, "email"),
    fullName: field(formData, "fullName"),
    password: field(formData, "password"),
  });
  if (!result.ok) failure("/register", result.code);
  if (result.requiresEmailConfirmation) redirect("/login?status=confirm_email");
  redirect("/onboarding");
}

export async function forgotPasswordFormAction(formData: FormData) {
  const result = await requestPasswordReset(field(formData, "email"));
  if (!result.ok) failure("/forgot-password", result.code);
  redirect("/forgot-password?status=sent");
}

export async function resetPasswordFormAction(formData: FormData) {
  const result = await updateOwnPassword(field(formData, "password"));
  if (!result.ok) failure("/reset-password", result.code);
  redirect("/app/account?status=password_updated");
}

export async function onboardingFormAction(formData: FormData) {
  const created = await createInitialClinic({
    name: field(formData, "name"),
    slug: field(formData, "slug"),
    timezone: field(formData, "timezone"),
  });
  if (!created.ok) failure("/onboarding", created.code);

  const selected = await selectActiveClinic({ clinicId: created.clinicId, next: "/app" });
  if (!selected.ok) failure("/onboarding", selected.code);
  redirect("/mfa?next=%2Fapp");
}

export type EnrollmentState =
  | { readonly status: "idle" }
  | { readonly status: "error" }
  | {
      readonly status: "ready";
      readonly factorId: string;
      readonly secret: string;
      readonly uri: string;
    };

export async function enrollMfaFormAction(
  _previous: EnrollmentState,
  formData: FormData,
): Promise<EnrollmentState> {
  const result = await enrollTotp(field(formData, "friendlyName"));
  if (!result.ok) return { status: "error" };
  return {
    status: "ready",
    factorId: result.factorId,
    secret: result.secret,
    uri: result.uri,
  };
}

export async function verifyMfaFormAction(formData: FormData) {
  const next = safeInternalRedirect(field(formData, "next"), "/app");
  const result = await verifyTotp(field(formData, "factorId"), field(formData, "code"));
  if (!result.ok) failure(`/mfa?next=${encodeURIComponent(next)}`, result.code);
  redirect(next);
}

export async function acceptInvitationFormAction(formData: FormData) {
  const result = await acceptClinicInvitation(field(formData, "token"));
  if (!result.ok) failure("/accept-invitation", result.code);
  const selected = await selectActiveClinic({ clinicId: result.clinicId, next: "/app" });
  if (!selected.ok) failure("/accept-invitation", selected.code);
  redirect("/mfa?next=%2Fapp");
}
