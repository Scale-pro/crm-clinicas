import "server-only";

import { z } from "zod";

import { requireAal2, requirePermission } from "@/shared/auth";
import { createServerSupabaseClient } from "@/shared/db";

const settingsSchema = z
  .object({
    clinicId: z.uuid(),
    name: z.string().trim().min(2).max(160),
    timezone: z.string().trim().min(1).max(64),
  })
  .strict();

export async function updateClinicSettings(input: unknown) {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;

  const [aal2, permission] = await Promise.all([
    requireAal2(),
    requirePermission(parsed.data.clinicId, "clinic.manage"),
  ]);
  if (!aal2.allowed) return { ok: false, code: "mfa_required" } as const;
  if (!permission.allowed) return { ok: false, code: "forbidden" } as const;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("update_clinic_settings", {
    clinic_id: parsed.data.clinicId,
    clinic_name: parsed.data.name,
    clinic_timezone: parsed.data.timezone,
  });
  if (error || data !== true) return { ok: false, code: "unavailable" } as const;
  return { ok: true } as const;
}
