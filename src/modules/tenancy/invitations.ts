import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import { requireAal2, requireSession } from "@/shared/auth";
import { serverEnv } from "@/shared/config";
import { createServerSupabaseClient } from "@/shared/db";

const inviteSchema = z.object({
  clinicId: z.uuid(),
  email: z.email().max(320),
  expiresInHours: z.number().int().min(1).max(24 * 30),
  role: z.enum(["admin", "manager", "sdr", "receptionist", "professional", "viewer"]),
});
const tokenSchema = z.string().min(43).max(128);

function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function inviteClinicMember(input: unknown) {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const aal2 = await requireAal2();
  if (!aal2.allowed) return { ok: false, code: "mfa_required" } as const;

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashInvitationToken(token);
  const expiresAt = new Date(
    Date.now() + parsed.data.expiresInHours * 60 * 60 * 1000,
  ).toISOString();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("invite_member", {
    clinic_id: parsed.data.clinicId,
    expires_at: expiresAt,
    member_email: parsed.data.email.trim().toLowerCase(),
    member_role: parsed.data.role,
    token_hash: tokenHash,
  });
  if (error || !data) return { ok: false, code: "forbidden" } as const;

  const link = new URL("/accept-invitation", serverEnv.APP_URL);
  link.searchParams.set("token", token);
  return { ok: true, invitationId: data, link: link.toString() } as const;
}

export async function acceptClinicInvitation(rawToken: unknown) {
  const parsed = tokenSchema.safeParse(rawToken);
  if (!parsed.success) return { ok: false, code: "invitation_unavailable" } as const;
  const session = await requireSession();
  if (!session.allowed) return { ok: false, code: "invitation_unavailable" } as const;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("accept_invitation", {
    token_hash: hashInvitationToken(parsed.data),
  });
  if (error || !data) return { ok: false, code: "invitation_unavailable" } as const;
  return { ok: true, clinicId: data } as const;
}
