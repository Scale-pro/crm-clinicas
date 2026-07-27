import "server-only";

import { z } from "zod";

import { createServerSupabaseClient } from "@/shared/db";

import { requirePlatformAdmin } from "./session";

const supportGrantSchema = z
  .object({
    accessLevel: z.literal("read_only"),
    clinicId: z.uuid(),
    expiresAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
const supportReadSchema = z
  .object({ clinicId: z.uuid(), grantId: z.uuid() })
  .strict();
const grantIdSchema = z.uuid();

type SupportFailureCode =
  | "forbidden"
  | "invalid_input"
  | "mfa_required"
  | "unauthenticated"
  | "unavailable";

type SupportFailure = {
  readonly ok: false;
  readonly code: SupportFailureCode;
};

async function requirePlatformAal2(): Promise<SupportFailure | null> {
  const guard = await requirePlatformAdmin();
  if (!guard.allowed) return { ok: false, code: guard.code };
  if (guard.session.aal !== "aal2") {
    return { ok: false, code: "mfa_required" };
  }
  return null;
}

function unavailable(): SupportFailure {
  return { ok: false, code: "unavailable" };
}

export async function listPlatformClinics() {
  const denial = await requirePlatformAal2();
  if (denial) return denial;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("platform_list_clinics");
  if (error) return unavailable();
  return { ok: true, clinics: data } as const;
}

export async function createReadOnlySupportGrant(input: unknown) {
  const parsed = supportGrantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;

  const expiresAt = Date.parse(parsed.data.expiresAt);
  const now = Date.now();
  if (expiresAt <= now || expiresAt > now + 24 * 60 * 60 * 1000) {
    return { ok: false, code: "invalid_input" } as const;
  }

  const denial = await requirePlatformAal2();
  if (denial) return denial;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_support_grant", {
    access_level: parsed.data.accessLevel,
    clinic_id: parsed.data.clinicId,
    expires_at: parsed.data.expiresAt,
    reason: parsed.data.reason,
  });
  if (error || !data) return unavailable();
  return { ok: true, grantId: data } as const;
}

export async function revokeReadOnlySupportGrant(input: unknown) {
  const parsed = grantIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const denial = await requirePlatformAal2();
  if (denial) return denial;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("revoke_support_grant", {
    grant_id: parsed.data,
  });
  if (error || data !== true) return unavailable();
  return { ok: true } as const;
}

async function parseSupportRead(input: unknown) {
  const parsed = supportReadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      failure: { ok: false, code: "invalid_input" },
    } as const;
  }
  const denial = await requirePlatformAal2();
  if (denial) return { ok: false, failure: denial } as const;
  return { ok: true, input: parsed.data } as const;
}

export async function readClinicMembersForSupport(input: unknown) {
  const parsed = await parseSupportRead(input);
  if (!parsed.ok) return parsed.failure;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("platform_read_clinic_members", {
    clinic_id: parsed.input.clinicId,
    grant_id: parsed.input.grantId,
  });
  if (error) return unavailable();
  return { ok: true, members: data } as const;
}

export async function readClinicInvitationsForSupport(input: unknown) {
  const parsed = await parseSupportRead(input);
  if (!parsed.ok) return parsed.failure;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("platform_read_clinic_invitations", {
    clinic_id: parsed.input.clinicId,
    grant_id: parsed.input.grantId,
  });
  if (error) return unavailable();
  return { ok: true, invitations: data } as const;
}

export async function readClinicConfigurationForSupport(input: unknown) {
  const parsed = await parseSupportRead(input);
  if (!parsed.ok) return parsed.failure;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("platform_read_clinic_configuration", {
    clinic_id: parsed.input.clinicId,
    grant_id: parsed.input.grantId,
  });
  if (error) return unavailable();
  return { ok: true, configuration: data } as const;
}

export async function readClinicAuditForSupport(input: unknown) {
  const parsed = await parseSupportRead(input);
  if (!parsed.ok) return parsed.failure;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("platform_read_clinic_audit", {
    clinic_id: parsed.input.clinicId,
    grant_id: parsed.input.grantId,
  });
  if (error) return unavailable();
  return { ok: true, audit: data } as const;
}
