import "server-only";

import { z } from "zod";

import { requireClinicAccess, requirePermission } from "@/shared/auth";
import { createServerSupabaseClient } from "@/shared/db";

export const listPipelineStagesSchema = z.object({
  clinicId: z.uuid(),
  pipelineId: z.uuid(),
  includeArchivedPipeline: z.boolean().default(false),
}).strict();

async function requirePipelineReadAccess(clinicId: string) {
  const clinicAccess = await requireClinicAccess(clinicId);
  if (!clinicAccess.allowed) {
    return { ok: false, code: clinicAccess.code } as const;
  }

  const viewAll = await requirePermission(clinicId, "opportunity.view_all");
  if (viewAll.allowed) return { ok: true } as const;
  if (viewAll.code !== "forbidden") {
    return { ok: false, code: viewAll.code } as const;
  }

  const viewOwn = await requirePermission(clinicId, "opportunity.view_own");
  if (viewOwn.allowed) return { ok: true } as const;
  return { ok: false, code: viewOwn.code } as const;
}

export async function listPipelineStages(input: unknown) {
  const parsed = listPipelineStagesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;

  try {
    const access = await requirePipelineReadAccess(parsed.data.clinicId);
    if (!access.ok) return access;

    const supabase = await createServerSupabaseClient();
    let pipelineQuery = supabase
      .from("pipelines")
      .select("id,name,is_default,archived_at")
      .eq("clinic_id", parsed.data.clinicId)
      .eq("id", parsed.data.pipelineId);
    if (!parsed.data.includeArchivedPipeline) {
      pipelineQuery = pipelineQuery.is("archived_at", null);
    }
    const pipeline = await pipelineQuery.maybeSingle();
    if (pipeline.error) return { ok: false, code: "unavailable" } as const;
    if (!pipeline.data) return { ok: false, code: "not_found" } as const;

    const stages = await supabase
      .from("pipeline_stages")
      .select("id,name,position,stage_kind")
      .eq("clinic_id", parsed.data.clinicId)
      .eq("pipeline_id", pipeline.data.id)
      .order("position")
      .order("id");
    if (stages.error) return { ok: false, code: "unavailable" } as const;

    return {
      ok: true,
      pipeline: {
        id: pipeline.data.id,
        name: pipeline.data.name,
        isDefault: pipeline.data.is_default,
        archivedAt: pipeline.data.archived_at,
      },
      stages: stages.data.map((stage) => ({
        id: stage.id,
        name: stage.name,
        position: stage.position,
        stageKind: stage.stage_kind,
      })),
    } as const;
  } catch {
    return { ok: false, code: "unavailable" } as const;
  }
}
