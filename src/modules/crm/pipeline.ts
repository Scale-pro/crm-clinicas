import "server-only";

import { z } from "zod";

import { requireAal2, requireClinicAccess, requirePermission } from "@/shared/auth";
import { createServerSupabaseClient } from "@/shared/db";

import { mapCrmError } from "./contacts";

const pipelineName = z.string().trim().min(2).max(80);

export const listPipelinesSchema = z.object({
  clinicId: z.uuid(),
  includeArchived: z.boolean().default(false),
}).strict();

export const createPipelineSchema = z.object({
  clinicId: z.uuid(),
  idempotencyKey: z.uuid(),
  name: pipelineName,
}).strict();

export const duplicatePipelineSchema = z.object({
  clinicId: z.uuid(),
  idempotencyKey: z.uuid(),
  name: pipelineName,
  sourcePipelineId: z.uuid(),
}).strict();

export const renamePipelineSchema = z.object({
  clinicId: z.uuid(),
  name: pipelineName,
  pipelineId: z.uuid(),
}).strict();

export const pipelineIdSchema = z.object({
  clinicId: z.uuid(),
  pipelineId: z.uuid(),
}).strict();

export const createPipelineStageSchema = z.object({
  clinicId: z.uuid(),
  name: z.string().trim().min(1).max(60),
  pipelineId: z.uuid().nullable().optional().default(null),
}).strict();

export const updatePipelineStageSchema = z.object({
  clinicId: z.uuid(),
  name: z.string().trim().min(1).max(60),
  pipelineStageId: z.uuid(),
}).strict();

export const reorderPipelineStagesSchema = z.object({
  clinicId: z.uuid(),
  stageIds: z.array(z.uuid()).min(1).max(100),
}).strict().refine((value) => new Set(value.stageIds).size === value.stageIds.length, {
  message: "Etapas repetidas não são permitidas.", path: ["stageIds"],
});

async function requirePipelineManagement(clinicId: string) {
  const permission = await requirePermission(clinicId, "pipeline.manage");
  if (!permission.allowed) return { ok: false, code: permission.code } as const;
  const aal2 = await requireAal2();
  if (!aal2.allowed) return { ok: false, code: aal2.code } as const;
  return { ok: true } as const;
}

export async function listPipelines(input: unknown) {
  const parsed = listPipelinesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireClinicAccess(parsed.data.clinicId);
  if (!access.allowed) return { ok: false, code: access.code } as const;

  const supabase = await createServerSupabaseClient();
  let pipelineQuery = supabase
    .from("pipelines")
    .select("id,name,is_default,archived_at,created_at,updated_at")
    .eq("clinic_id", parsed.data.clinicId)
    .order("is_default", { ascending: false })
    .order("name")
    .order("id");
  if (!parsed.data.includeArchived) {
    pipelineQuery = pipelineQuery.is("archived_at", null);
  }
  const pipelines = await pipelineQuery;
  if (pipelines.error) return { ok: false, code: "unavailable" } as const;

  const pipelineIds = pipelines.data.map((pipeline) => pipeline.id);
  const stages = pipelineIds.length
    ? await supabase
      .from("pipeline_stages")
      .select("id,pipeline_id,name,position,stage_kind")
      .eq("clinic_id", parsed.data.clinicId)
      .in("pipeline_id", pipelineIds)
      .order("position")
      .order("id")
    : { data: [], error: null };
  if (stages.error) return { ok: false, code: "unavailable" } as const;

  const stagesByPipeline = Map.groupBy(stages.data, (stage) => stage.pipeline_id);
  return {
    ok: true,
    pipelines: pipelines.data.map((pipeline) => ({
      ...pipeline,
      stages: stagesByPipeline.get(pipeline.id) ?? [],
    })),
  } as const;
}

export async function createPipeline(input: unknown) {
  const parsed = createPipelineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requirePipelineManagement(parsed.data.clinicId);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("create_pipeline", {
    clinic_id: parsed.data.clinicId,
    idempotency_key: parsed.data.idempotencyKey,
    name: parsed.data.name,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true, pipelineId: result.data } as const;
}

export async function duplicatePipeline(input: unknown) {
  const parsed = duplicatePipelineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requirePipelineManagement(parsed.data.clinicId);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("duplicate_pipeline", {
    clinic_id: parsed.data.clinicId,
    idempotency_key: parsed.data.idempotencyKey,
    name: parsed.data.name,
    source_pipeline_id: parsed.data.sourcePipelineId,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true, pipelineId: result.data } as const;
}

export async function renamePipeline(input: unknown) {
  const parsed = renamePipelineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requirePipelineManagement(parsed.data.clinicId);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("rename_pipeline", {
    clinic_id: parsed.data.clinicId,
    name: parsed.data.name,
    pipeline_id: parsed.data.pipelineId,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true } as const;
}

export async function setDefaultPipeline(input: unknown) {
  const parsed = pipelineIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requirePipelineManagement(parsed.data.clinicId);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("set_default_pipeline", {
    clinic_id: parsed.data.clinicId,
    pipeline_id: parsed.data.pipelineId,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true } as const;
}

export async function archivePipeline(input: unknown) {
  const parsed = pipelineIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requirePipelineManagement(parsed.data.clinicId);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("archive_pipeline", {
    clinic_id: parsed.data.clinicId,
    pipeline_id: parsed.data.pipelineId,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true } as const;
}

export async function createPipelineStage(input: unknown) {
  const parsed = createPipelineStageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requirePipelineManagement(parsed.data.clinicId);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("create_pipeline_stage", {
    clinic_id: parsed.data.clinicId,
    name: parsed.data.name,
    pipeline_id: parsed.data.pipelineId,
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
    clinic_id: parsed.data.clinicId,
    name: parsed.data.name,
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
    clinic_id: parsed.data.clinicId,
    stage_ids: parsed.data.stageIds,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true } as const;
}
