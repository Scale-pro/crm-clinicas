import "server-only";

import { z } from "zod";

import { requirePermission } from "@/shared/auth";
import { createServerSupabaseClient } from "@/shared/db";

import { mapCrmError } from "./contacts";

export const leadSourceSchema = z
  .object({ clinicId: z.uuid(), name: z.string().trim().min(2).max(80) })
  .strict();

export async function listLeadSources(clinicId: string) {
  const parsed = z.uuid().safeParse(clinicId);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const supabase = await createServerSupabaseClient();
  const result = await supabase
    .from("lead_sources")
    .select("id,name,archived_at")
    .eq("clinic_id", parsed.data)
    .order("name");
  if (result.error) return { ok: false, code: "unavailable" } as const;
  return { ok: true, leadSources: result.data } as const;
}

export async function createLeadSource(input: unknown) {
  const parsed = leadSourceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const permission = await requirePermission(parsed.data.clinicId, "lead_source.manage");
  if (!permission.allowed) return { ok: false, code: "forbidden" } as const;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("create_lead_source", {
    clinic_id: parsed.data.clinicId,
    name: parsed.data.name,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true, leadSourceId: result.data } as const;
}
