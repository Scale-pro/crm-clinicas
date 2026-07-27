import "server-only";

import { z } from "zod";

import { serverEnv } from "@/shared/config";
import { createServerSupabaseClient } from "@/shared/db";

import { safeInternalRedirect } from "./safe-redirect";
import { requireAal2, requireSession } from "./session";

const credentialsSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(72),
});
const emailSchema = z.email().max(320);
const passwordSchema = z.string().min(12).max(72);
const factorIdSchema = z.uuid();
const totpCodeSchema = z.string().regex(/^\d{6}$/);

type NeutralFailure = { readonly ok: false; readonly code: "invalid_input" | "unavailable" };

export type LoginResult =
  | {
      readonly ok: true;
      readonly next: "authenticated" | "challenge_required" | "enrollment_required";
      readonly redirectTo: string;
    }
  | NeutralFailure;

export async function loginWithPassword(
  input: unknown,
  requestedRedirect?: string | null,
): Promise<LoginResult> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };

  const supabase = await createServerSupabaseClient();
  const signedIn = await supabase.auth.signInWithPassword({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
  });
  if (signedIn.error) return { ok: false, code: "unavailable" };

  const claims = await supabase.auth.getClaims();
  if (claims.error || !claims.data?.claims.sub) {
    return { ok: false, code: "unavailable" };
  }

  const [requirement, factors, assurance] = await Promise.all([
    supabase.rpc("current_user_requires_mfa"),
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (requirement.error || factors.error || assurance.error) {
    return { ok: false, code: "unavailable" };
  }

  const requiresMfa = requirement.data === true;
  const verifiedTotp = factors.data.totp.length;
  let next: "authenticated" | "challenge_required" | "enrollment_required" =
    "authenticated";
  if (requiresMfa && verifiedTotp === 0) next = "enrollment_required";
  else if (
    assurance.data.currentLevel !== "aal2" &&
    assurance.data.nextLevel === "aal2"
  ) {
    next = "challenge_required";
  }

  return {
    ok: true,
    next,
    redirectTo: safeInternalRedirect(requestedRedirect, "/app"),
  };
}

export async function requestPasswordReset(input: unknown) {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.toLowerCase(),
    {
      redirectTo: new URL(
        "/auth/callback?next=/reset-password",
        serverEnv.APP_URL,
      ).toString(),
    },
  );
  if (error) return { ok: false, code: "unavailable" } as const;
  return { ok: true } as const;
}

export async function updateOwnPassword(input: unknown) {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const guard = await requireSession();
  if (!guard.allowed) return { ok: false, code: "unauthenticated" } as const;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { ok: false, code: "unavailable" } as const;
  return { ok: true } as const;
}

export async function enrollTotp(friendlyName: unknown) {
  const parsed = z.string().trim().min(1).max(80).safeParse(friendlyName);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const guard = await requireSession();
  if (!guard.allowed) return { ok: false, code: "unauthenticated" } as const;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: parsed.data,
  });
  if (error || !("totp" in data)) return { ok: false, code: "unavailable" } as const;
  return {
    ok: true,
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  } as const;
}

export async function verifyTotp(factorId: unknown, code: unknown) {
  const factor = factorIdSchema.safeParse(factorId);
  const token = totpCodeSchema.safeParse(code);
  if (!factor.success || !token.success) {
    return { ok: false, code: "invalid_input" } as const;
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.data,
    code: token.data,
  });
  if (error) return { ok: false, code: "unavailable" } as const;
  return { ok: true } as const;
}

export async function getMfaState() {
  const guard = await requireSession();
  if (!guard.allowed) return { ok: false, code: "unauthenticated" } as const;
  const supabase = await createServerSupabaseClient();
  const [requirement, factors, assurance] = await Promise.all([
    supabase.rpc("current_user_requires_mfa"),
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (requirement.error || factors.error || assurance.error) {
    return { ok: false, code: "unavailable" } as const;
  }

  return {
    ok: true,
    aal: assurance.data.currentLevel,
    enrollmentRequired: requirement.data === true && factors.data.totp.length === 0,
    factors: factors.data.totp.map((factor) => ({
      friendlyName: factor.friendly_name,
      id: factor.id,
    })),
  } as const;
}

export async function removeOwnTotpFactor(factorId: unknown) {
  const parsed = factorIdSchema.safeParse(factorId);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const aal2 = await requireAal2();
  if (!aal2.allowed) return { ok: false, code: "mfa_required" } as const;

  const supabase = await createServerSupabaseClient();
  const [requirement, factors] = await Promise.all([
    supabase.rpc("current_user_requires_mfa"),
    supabase.auth.mfa.listFactors(),
  ]);
  if (requirement.error || factors.error) {
    return { ok: false, code: "unavailable" } as const;
  }
  if (requirement.data === true && factors.data.totp.length <= 1) {
    return { ok: false, code: "last_factor_required" } as const;
  }
  if (!factors.data.totp.some((factor) => factor.id === parsed.data)) {
    return { ok: false, code: "invalid_input" } as const;
  }

  const { error } = await supabase.auth.mfa.unenroll({ factorId: parsed.data });
  if (error) return { ok: false, code: "unavailable" } as const;
  return { ok: true } as const;
}
