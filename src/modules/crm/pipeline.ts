import "server-only";

import { z } from "zod";

import { requireAal2, requirePermission } from "@/shared/auth";
import { createServerSupabaseClient } from "@/shared/db";

import { mapCrmError } from "./contacts";

export const createPipelineStageSchema = z.object({
  clinicId: z.uuid(), name: z.string().trim().min(1).max(60),
}).strict();
export const updatePipelineStageSchema = z.object({
  clinicId: z.uuid(), name: z.string().trim().min(1).max(60), pipelineStageId: z.uuid(),
}).strict();
export const reorderPipelineStagesSchema = z.object({
  clinicId: z.uuid(), stageIds: z.array(z.uuid()).min(1).max(100),
}).strict().refine((value) => new Set(value.stageIds).size === value.stageIds.length, {
  message: "Etapas repetidas não são permitidas.", path: ["stageIds"],
});

async function requirePipelineManagement(clinicId: string) {
  const permission = await requirePermission(clinicId, "pipeline.manage");
  if (!permission.allowed) return { ok: false, code: "forbidden" } as const;
  const aal2 = await requireAal2();
  if (!aal2.allowed) return { ok: false, code: aal2.code } as const;
  return { ok: true } as const;
}

export async function createPipelineStage(input: unknown) {
  const parsed = createPipelineStageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requirePipelineManagement(parsed.data.clinicId);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("create_pipeline_stage", {
    clinic_id: parsed.data.clinicId, name: parsed.data.name,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true, pipelineStageId: result.data } as const;
}

export async function updatePipelineStage(input: unknown) {
  const parsed = updatePipelineStageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requirePipelineManagement(parsed.data.clinicId);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("update_pipeline_stage", {
    clinic_id: parsed.data.clinicId, name: parsed.data.name,
    pipeline_stage_id: parsed.data.pipelineStageId,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true } as const;
}

export async function reorderPipelineStages(input: unknown) {
  const parsed = reorderPipelineStagesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requirePipelineManagement(parsed.data.clinicId);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("reorder_pipeline_stages", {
    clinic_id: parsed.data.clinicId, stage_ids: parsed.data.stageIds,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true } as const;
}
