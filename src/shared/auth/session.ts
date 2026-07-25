import "server-only";

import { createServerSupabaseClient } from "@/shared/db";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERMISSION_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

export type VerifiedSession = {
  readonly aal: "aal1" | "aal2";
  readonly userId: string;
};

export type GuardDenial = {
  readonly allowed: false;
  readonly code: "unauthenticated" | "forbidden" | "mfa_required" | "unavailable";
};

export type AuthGuardResult =
  | { readonly allowed: true; readonly session: VerifiedSession }
  | GuardDenial;

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

async function verifiedSession(
  supabase: ServerSupabaseClient,
): Promise<AuthGuardResult> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    const userId = data?.claims.sub;
    if (error || !userId || !UUID_PATTERN.test(userId)) {
      return { allowed: false, code: "unauthenticated" };
    }

    return {
      allowed: true,
      session: {
        aal: data.claims.aal === "aal2" ? "aal2" : "aal1",
        userId,
      },
    };
  } catch {
    return { allowed: false, code: "unavailable" };
  }
}

export async function requireSession(): Promise<AuthGuardResult> {
  return verifiedSession(await createServerSupabaseClient());
}

export async function requireClinicAccess(
  clinicId: string,
): Promise<AuthGuardResult> {
  if (!UUID_PATTERN.test(clinicId)) return { allowed: false, code: "forbidden" };

  const supabase = await createServerSupabaseClient();
  const session = await verifiedSession(supabase);
  if (!session.allowed) return session;

  const { data, error } = await supabase.rpc("current_user_clinic_ids");
  if (error) return { allowed: false, code: "unavailable" };
  if (!data.includes(clinicId)) return { allowed: false, code: "forbidden" };
  return session;
}

export async function requirePermission(
  clinicId: string,
  permissionKey: string,
): Promise<AuthGuardResult> {
  if (!UUID_PATTERN.test(clinicId) || !PERMISSION_PATTERN.test(permissionKey)) {
    return { allowed: false, code: "forbidden" };
  }

  const supabase = await createServerSupabaseClient();
  const session = await verifiedSession(supabase);
  if (!session.allowed) return session;

  const { data, error } = await supabase.rpc("current_user_has_permission", {
    clinic_id: clinicId,
    permission_key: permissionKey,
  });
  if (error) return { allowed: false, code: "unavailable" };
  if (!data) return { allowed: false, code: "forbidden" };
  return session;
}

export async function requirePlatformAdmin(): Promise<AuthGuardResult> {
  const supabase = await createServerSupabaseClient();
  const session = await verifiedSession(supabase);
  if (!session.allowed) return session;

  const { data, error } = await supabase.rpc("current_user_is_platform_admin");
  if (error) return { allowed: false, code: "unavailable" };
  if (!data) return { allowed: false, code: "forbidden" };
  return session;
}

export async function requireAal2(): Promise<AuthGuardResult> {
  const session = await requireSession();
  if (!session.allowed) return session;
  if (session.session.aal !== "aal2") {
    return { allowed: false, code: "mfa_required" };
  }
  return session;
}

/**
 * Revoga a sessão no Supabase Auth em escopo global. O chamador só deve
 * redirecionar após `true`; falhas retornam mensagem neutra e permitem retry.
 */
export async function signOutCurrentSession(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  return error === null;
}
