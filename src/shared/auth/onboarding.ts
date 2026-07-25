import "server-only";

import { z } from "zod";

import { createServerSupabaseClient } from "@/shared/db";

import { requireSession } from "./session";

const registrationSchema = z.object({
  email: z.email().max(320),
  fullName: z.string().trim().min(2).max(160),
  password: z.string().min(12).max(72),
});

const clinicOnboardingSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  timezone: z.string().min(1).max(64),
});

export type RegistrationResult =
  | { readonly ok: true; readonly requiresEmailConfirmation: boolean }
  | { readonly ok: false; readonly code: "invalid_input" | "unavailable" };

export type ClinicOnboardingResult =
  | { readonly ok: true; readonly clinicId: string }
  | {
      readonly ok: false;
      readonly code: "invalid_input" | "unauthenticated" | "forbidden" | "unavailable";
    };

export async function registerAccount(
  input: unknown,
): Promise<RegistrationResult> {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
    },
  });

  if (error) return { ok: false, code: "unavailable" };
  return {
    ok: true,
    requiresEmailConfirmation: data.session === null,
  };
}

export async function createInitialClinic(
  input: unknown,
): Promise<ClinicOnboardingResult> {
  const parsed = clinicOnboardingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };

  const guard = await requireSession();
  if (!guard.allowed) {
    return {
      ok: false,
      code: guard.code === "unauthenticated" ? "unauthenticated" : "unavailable",
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_clinic_with_owner", {
    clinic_name: parsed.data.name,
    clinic_slug: parsed.data.slug,
    clinic_timezone: parsed.data.timezone,
  });
  if (error || !data) return { ok: false, code: "forbidden" };
  return { ok: true, clinicId: data };
}
