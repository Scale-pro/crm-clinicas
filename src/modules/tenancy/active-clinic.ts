import "server-only";

import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { serverEnv } from "@/shared/config";
import { createServerSupabaseClient } from "@/shared/db";
import { errorCapture } from "@/shared/observability";
import {
  ACTIVE_CLINIC_COOKIE_NAME,
  canSelectClinic,
  requireSession,
  resolveClinicSelection,
  safeInternalRedirect,
  shouldSecureActiveClinicCookie,
  signActiveClinicValue,
  type ClinicChoice,
  verifyActiveClinicValue,
} from "@/shared/auth";

const selectionSchema = z
  .object({
    clinicId: z.uuid(),
    next: z.string().max(2048).optional(),
  })
  .strict();

export type ActiveClinicContextResult =
  | {
      readonly status: "ready";
      readonly clinic: ClinicChoice;
      readonly clinics: readonly ClinicChoice[];
      readonly persisted: boolean;
    }
  | { readonly status: "selection_required"; readonly clinics: readonly ClinicChoice[] }
  | { readonly status: "no_memberships" }
  | { readonly status: "mfa_required" }
  | { readonly status: "unauthenticated" }
  | { readonly status: "unavailable" };

export function activeClinicCookieOptions() {
  return {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax" as const,
    secure: shouldSecureActiveClinicCookie(serverEnv.APP_ENV),
  };
}

export async function listCurrentUserClinics(): Promise<
  | { readonly ok: true; readonly clinics: readonly ClinicChoice[] }
  | { readonly ok: false; readonly code: "unauthenticated" | "unavailable" }
> {
  const session = await requireSession();
  if (!session.allowed) {
    return {
      ok: false,
      code: session.code === "unauthenticated" ? "unauthenticated" : "unavailable",
    };
  }

  const supabase = await createServerSupabaseClient();
  const memberships = await supabase.rpc("current_user_clinic_ids");
  if (memberships.error) return { ok: false, code: "unavailable" };
  if (memberships.data.length === 0) return { ok: true, clinics: [] };

  const clinics = await supabase
    .from("clinics")
    .select("id,name,slug,timezone")
    .in("id", memberships.data)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name")
    .order("id");
  if (clinics.error) return { ok: false, code: "unavailable" };
  return { ok: true, clinics: clinics.data };
}

export async function resolveActiveClinicContext(): Promise<ActiveClinicContextResult> {
  try {
    const session = await requireSession();
    if (!session.allowed) {
      return {
        status: session.code === "unauthenticated" ? "unauthenticated" : "unavailable",
      };
    }

    const supabase = await createServerSupabaseClient();
    const [clinics, requirement] = await Promise.all([
      listCurrentUserClinics(),
      supabase.rpc("current_user_requires_mfa"),
    ]);
    if (!clinics.ok || requirement.error) return { status: "unavailable" };
    if (requirement.data === true && session.session.aal !== "aal2") {
      return { status: "mfa_required" };
    }

    const cookieStore = await cookies();
    const clinicId = verifyActiveClinicValue(
      cookieStore.get(ACTIVE_CLINIC_COOKIE_NAME)?.value,
      serverEnv.ACTIVE_CLINIC_COOKIE_SECRET,
    );
    const selection = resolveClinicSelection(clinics.clinics, clinicId);
    if (selection.kind === "empty") return { status: "no_memberships" };
    if (selection.kind === "selection_required") {
      return { status: "selection_required", clinics: selection.clinics };
    }
    return {
      status: "ready",
      clinic: selection.clinic,
      clinics: clinics.clinics,
      persisted: selection.persisted,
    };
  } catch (error) {
    unstable_rethrow(error);
    errorCapture.capture(error, { error_code: "active_clinic_resolution_failed" });
    return { status: "unavailable" };
  }
}

export async function selectActiveClinic(input: unknown) {
  const parsed = selectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;

  const clinics = await listCurrentUserClinics();
  if (!clinics.ok) return { ok: false, code: clinics.code } as const;
  if (!canSelectClinic(parsed.data.clinicId, clinics.clinics)) {
    return { ok: false, code: "forbidden" } as const;
  }

  const cookieStore = await cookies();
  cookieStore.set(
    ACTIVE_CLINIC_COOKIE_NAME,
    signActiveClinicValue(
      parsed.data.clinicId,
      serverEnv.ACTIVE_CLINIC_COOKIE_SECRET,
    ),
    activeClinicCookieOptions(),
  );
  return {
    ok: true,
    clinicId: parsed.data.clinicId,
    redirectTo: safeInternalRedirect(parsed.data.next, "/app"),
  } as const;
}

export async function clearActiveClinicCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_CLINIC_COOKIE_NAME);
}
