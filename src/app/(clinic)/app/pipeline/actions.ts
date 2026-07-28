"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  assignOpportunity,
  closeOpportunity,
  createOpportunity,
  createPipelineStage,
  moveOpportunity,
  reopenOpportunity,
  reorderPipelineStages,
  updateOpportunity,
  updatePipelineStage,
} from "@/modules/crm";
import { resolveActiveClinicContext } from "@/modules/tenancy";

const uuid = z.uuid();
const version = z.coerce.number().int().min(1);

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function checked(formData: FormData, name: string): boolean {
  return formData.get(name) === "on" || formData.get(name) === "true";
}

function amountInCents(value: string): number | null | undefined {
  const normalized = value.trim().replace(".", "").replace(",", ".");
  if (!normalized) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return undefined;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) ? cents : undefined;
}

async function activeClinic(formData: FormData, fallback: string) {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready" || field(formData, "clinicId") !== context.clinic.id) {
    redirect(`${fallback}?error=forbidden`);
  }
  return context.clinic.id;
}

function opportunityPath(opportunityId: string, code?: string) {
  const path = `/app/opportunities/${encodeURIComponent(opportunityId)}`;
  return code ? `${path}?error=${encodeURIComponent(code)}` : path;
}

export async function createOpportunityFormAction(formData: FormData) {
  const clinicId = await activeClinic(formData, "/app/pipeline");
  const payload = z.object({
    amountCents: z.number().int().min(0).nullable(),
    clinicId: uuid,
    confirmedExistingOpen: z.boolean(),
    contactId: uuid,
    idempotencyKey: uuid,
    initialSourceId: uuid.nullable(),
    title: z.string().trim().min(2).max(160),
  }).strict().safeParse({
    amountCents: amountInCents(field(formData, "amount")),
    clinicId,
    confirmedExistingOpen: checked(formData, "confirmedExistingOpen"),
    contactId: field(formData, "contactId"),
    idempotencyKey: field(formData, "idempotencyKey"),
    initialSourceId: field(formData, "initialSourceId") || null,
    title: field(formData, "title"),
  });
  if (!payload.success) redirect("/app/pipeline?error=invalid_input");
  const result = await createOpportunity(payload.data);
  if (!result.ok) {
    if (result.code === "existing_open") {
      redirect(`/app/pipeline?error=existing_open&contactId=${encodeURIComponent(payload.data.contactId)}&idempotencyKey=${encodeURIComponent(payload.data.idempotencyKey)}`);
    }
    redirect(`/app/pipeline?error=${encodeURIComponent(result.code)}`);
  }
  revalidatePath("/app/pipeline");
  redirect(`/app/opportunities/${result.opportunityId}?status=created`);
}

export async function moveOpportunityFormAction(formData: FormData) {
  const opportunityId = field(formData, "opportunityId");
  const returnTo = field(formData, "returnTo") === "detail"
    ? opportunityPath(opportunityId)
    : "/app/pipeline";
  const clinicId = await activeClinic(formData, returnTo);
  const payload = z.object({
    clinicId: uuid, expectedVersion: version, opportunityId: uuid, targetStageId: uuid,
  }).strict().safeParse({
    clinicId, expectedVersion: field(formData, "expectedVersion"), opportunityId,
    targetStageId: field(formData, "targetStageId"),
  });
  if (!payload.success) redirect(`${returnTo}?error=invalid_input`);
  const result = await moveOpportunity(payload.data);
  if (!result.ok) redirect(`${returnTo}?error=${encodeURIComponent(result.code)}`);
  revalidatePath("/app/pipeline");
  revalidatePath(opportunityPath(opportunityId));
  redirect(`${returnTo}?status=moved`);
}

export async function closeOpportunityFormAction(formData: FormData) {
  const opportunityId = field(formData, "opportunityId");
  const returnTo = field(formData, "returnTo") === "pipeline" ? "/app/pipeline" : opportunityPath(opportunityId);
  const clinicId = await activeClinic(formData, returnTo);
  const payload = z.object({
    clinicId: uuid,
    closeReason: z.string().trim().max(500).nullable(),
    expectedVersion: version,
    opportunityId: uuid,
    targetStatus: z.enum(["won", "lost"]),
  }).strict().safeParse({
    clinicId, closeReason: field(formData, "closeReason") || null,
    expectedVersion: field(formData, "expectedVersion"), opportunityId,
    targetStatus: field(formData, "targetStatus"),
  });
  if (!payload.success) redirect(`${returnTo}?error=invalid_input`);
  const result = await closeOpportunity(payload.data);
  if (!result.ok) redirect(`${returnTo}?error=${encodeURIComponent(result.code)}`);
  revalidatePath("/app/pipeline");
  revalidatePath(opportunityPath(opportunityId));
  redirect(`${returnTo}?status=closed`);
}

export async function updateOpportunityFormAction(formData: FormData) {
  const opportunityId = field(formData, "opportunityId");
  const fallback = opportunityPath(opportunityId);
  const clinicId = await activeClinic(formData, fallback);
  const payload = z.object({
    amountCents: z.number().int().min(0).nullable(), clinicId: uuid,
    expectedVersion: version, initialSourceId: uuid.nullable(), opportunityId: uuid,
    title: z.string().trim().min(2).max(160),
  }).strict().safeParse({
    amountCents: amountInCents(field(formData, "amount")), clinicId,
    expectedVersion: field(formData, "expectedVersion"),
    initialSourceId: field(formData, "initialSourceId") || null, opportunityId,
    title: field(formData, "title"),
  });
  if (!payload.success) redirect(`${fallback}?error=invalid_input`);
  const result = await updateOpportunity(payload.data);
  if (!result.ok) redirect(`${fallback}?error=${encodeURIComponent(result.code)}`);
  revalidatePath("/app/pipeline");
  revalidatePath(fallback);
  redirect(`${fallback}?status=updated`);
}

export async function assignOpportunityFormAction(formData: FormData) {
  const opportunityId = field(formData, "opportunityId");
  const fallback = opportunityPath(opportunityId);
  const clinicId = await activeClinic(formData, fallback);
  const payload = z.object({
    assignedToUserId: uuid, clinicId: uuid, expectedVersion: version, opportunityId: uuid,
  }).strict().safeParse({
    assignedToUserId: field(formData, "assignedToUserId"), clinicId,
    expectedVersion: field(formData, "expectedVersion"), opportunityId,
  });
  if (!payload.success) redirect(`${fallback}?error=invalid_input`);
  const result = await assignOpportunity(payload.data);
  if (!result.ok) redirect(`${fallback}?error=${encodeURIComponent(result.code)}`);
  revalidatePath("/app/pipeline");
  revalidatePath(fallback);
  redirect(`${fallback}?status=assigned`);
}

export async function reopenOpportunityFormAction(formData: FormData) {
  const opportunityId = field(formData, "opportunityId");
  const fallback = opportunityPath(opportunityId);
  const clinicId = await activeClinic(formData, fallback);
  const payload = z.object({
    clinicId: uuid, expectedVersion: version, opportunityId: uuid,
    reason: z.string().trim().min(2).max(500), targetStageId: uuid,
  }).strict().safeParse({
    clinicId, expectedVersion: field(formData, "expectedVersion"), opportunityId,
    reason: field(formData, "reason"), targetStageId: field(formData, "targetStageId"),
  });
  if (!payload.success) redirect(`${fallback}?error=invalid_input`);
  const result = await reopenOpportunity(payload.data);
  if (!result.ok) redirect(`${fallback}?error=${encodeURIComponent(result.code)}`);
  revalidatePath("/app/pipeline");
  revalidatePath(fallback);
  redirect(`${fallback}?status=reopened`);
}

export async function createPipelineStageFormAction(formData: FormData) {
  const clinicId = await activeClinic(formData, "/app/pipeline");
  const payload = z.object({ clinicId: uuid, name: z.string().trim().min(1).max(60) })
    .strict().safeParse({ clinicId, name: field(formData, "name") });
  if (!payload.success) redirect("/app/pipeline?error=invalid_input");
  const result = await createPipelineStage(payload.data);
  if (!result.ok) redirect(`/app/pipeline?error=${encodeURIComponent(result.code)}`);
  revalidatePath("/app/pipeline");
  redirect("/app/pipeline?status=stage_created");
}

export async function updatePipelineStageFormAction(formData: FormData) {
  const clinicId = await activeClinic(formData, "/app/pipeline");
  const payload = z.object({
    clinicId: uuid, name: z.string().trim().min(1).max(60), pipelineStageId: uuid,
  }).strict().safeParse({
    clinicId, name: field(formData, "name"), pipelineStageId: field(formData, "pipelineStageId"),
  });
  if (!payload.success) redirect("/app/pipeline?error=invalid_input");
  const result = await updatePipelineStage(payload.data);
  if (!result.ok) redirect(`/app/pipeline?error=${encodeURIComponent(result.code)}`);
  revalidatePath("/app/pipeline");
  redirect("/app/pipeline?status=stage_updated");
}

export async function reorderPipelineStagesFormAction(formData: FormData) {
  const clinicId = await activeClinic(formData, "/app/pipeline");
  const payload = z.object({ clinicId: uuid, stageIds: z.array(uuid).min(1).max(100) })
    .strict().refine((value) => new Set(value.stageIds).size === value.stageIds.length)
    .safeParse({ clinicId, stageIds: field(formData, "stageIds").split(",").filter(Boolean) });
  if (!payload.success) redirect("/app/pipeline?error=invalid_input");
  const result = await reorderPipelineStages(payload.data);
  if (!result.ok) redirect(`/app/pipeline?error=${encodeURIComponent(result.code)}`);
  revalidatePath("/app/pipeline");
  redirect("/app/pipeline?status=stages_reordered");
}
