"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  archivePipeline,
  createPipeline,
  createPipelineStage,
  renamePipeline,
  reorderPipelineStages,
  setDefaultPipeline,
  updatePipelineStage,
} from "@/modules/crm";
import { resolveActiveClinicContext } from "@/modules/tenancy";

/**
 * Server Actions da configuração de pipelines.
 *
 * Finas de propósito: cada uma liga um formulário a um contrato público de
 * `@/modules/crm`. Nenhuma regra de negócio, consulta ou SQL vive aqui.
 *
 * Invariantes:
 *
 * - o `clinicId` é resolvido no servidor e **não existe** como campo de
 *   formulário — o navegador não opina sobre o tenant;
 * - toda entrada passa por Zod `.strict()` antes de chegar ao módulo;
 * - criação leva `idempotencyKey` novo, porque o contrato exige;
 * - cada formulário envia **apenas os seus campos**: renomear não mexe na
 *   ordem, ordenar não mexe no nome, definir padrão não mexe em etapa;
 * - o redirecionamento carrega só códigos do nosso vocabulário;
 * - a rota é revalidada após sucesso.
 *
 * Os contratos de pipeline exigem `pipeline.manage` **e** AAL2, ambos
 * verificados no módulo e novamente no banco. A interface esconder um botão é
 * conforto, não controle de acesso.
 *
 * Não há `expectedVersion` aqui: a tabela de pipelines não versiona e nenhuma
 * RPC de pipeline aceita versão esperada.
 */

const uuid = z.uuid();
const PIPELINES_PATH = "/app/settings/pipelines";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Única origem do tenant. Não existe `clinicId` de entrada nesta camada. */
async function activeClinicId(fallback: string): Promise<string> {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") redirect(`${fallback}?error=forbidden`);
  return context.clinic.id;
}

/** Mantém o pipeline selecionado ao voltar, para não perder o contexto da tela. */
function pipelinePath(pipelineId: string): string {
  return pipelineId ? `${PIPELINES_PATH}?pipeline=${encodeURIComponent(pipelineId)}` : PIPELINES_PATH;
}

function back(path: string, key: "error" | "status", code: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(code)}`);
}

function revalidatePipelines() {
  revalidatePath(PIPELINES_PATH);
  revalidatePath("/app/pipeline");
  revalidatePath("/app/settings/pipeline");
}

export async function createPipelineAction(formData: FormData) {
  const clinicId = await activeClinicId(PIPELINES_PATH);
  const payload = z.object({
    clinicId: uuid,
    idempotencyKey: uuid,
    name: z.string().trim().min(2).max(80),
  }).strict().safeParse({
    clinicId,
    idempotencyKey: randomUUID(),
    name: field(formData, "name"),
  });
  if (!payload.success) back(PIPELINES_PATH, "error", "invalid_input");
  const result = await createPipeline(payload.data);
  if (!result.ok) back(PIPELINES_PATH, "error", result.code);
  revalidatePipelines();
  back(pipelinePath(result.pipelineId), "status", "pipeline_created");
}

export async function renamePipelineAction(formData: FormData) {
  const pipelineId = field(formData, "pipelineId");
  const path = pipelinePath(pipelineId);
  const clinicId = await activeClinicId(PIPELINES_PATH);
  const payload = z.object({
    clinicId: uuid,
    name: z.string().trim().min(2).max(80),
    pipelineId: uuid,
  }).strict().safeParse({ clinicId, name: field(formData, "name"), pipelineId });
  if (!payload.success) back(path, "error", "invalid_input");
  const result = await renamePipeline(payload.data);
  if (!result.ok) back(path, "error", result.code);
  revalidatePipelines();
  back(path, "status", "pipeline_renamed");
}

export async function setDefaultPipelineAction(formData: FormData) {
  const pipelineId = field(formData, "pipelineId");
  const path = pipelinePath(pipelineId);
  const clinicId = await activeClinicId(PIPELINES_PATH);
  const payload = z.object({ clinicId: uuid, pipelineId: uuid }).strict()
    .safeParse({ clinicId, pipelineId });
  if (!payload.success) back(path, "error", "invalid_input");
  const result = await setDefaultPipeline(payload.data);
  if (!result.ok) back(path, "error", result.code);
  revalidatePipelines();
  back(path, "status", "pipeline_default_set");
}

export async function archivePipelineAction(formData: FormData) {
  const pipelineId = field(formData, "pipelineId");
  const clinicId = await activeClinicId(PIPELINES_PATH);
  const payload = z.object({ clinicId: uuid, pipelineId: uuid }).strict()
    .safeParse({ clinicId, pipelineId });
  if (!payload.success) back(pipelinePath(pipelineId), "error", "invalid_input");
  const result = await archivePipeline(payload.data);
  if (!result.ok) back(pipelinePath(pipelineId), "error", result.code);
  revalidatePipelines();
  // Após arquivar, o pipeline deixa de ser um destino útil: volta para a lista.
  back(PIPELINES_PATH, "status", "pipeline_archived");
}

export async function createPipelineStageAction(formData: FormData) {
  const pipelineId = field(formData, "pipelineId");
  const path = pipelinePath(pipelineId);
  const clinicId = await activeClinicId(PIPELINES_PATH);
  const payload = z.object({
    clinicId: uuid,
    name: z.string().trim().min(1).max(60),
    pipelineId: uuid,
  }).strict().safeParse({ clinicId, name: field(formData, "name"), pipelineId });
  if (!payload.success) back(path, "error", "invalid_input");
  const result = await createPipelineStage(payload.data);
  if (!result.ok) back(path, "error", result.code);
  revalidatePipelines();
  back(path, "status", "stage_created");
}

export async function updatePipelineStageAction(formData: FormData) {
  const pipelineId = field(formData, "pipelineId");
  const path = pipelinePath(pipelineId);
  const clinicId = await activeClinicId(PIPELINES_PATH);
  const payload = z.object({
    clinicId: uuid,
    name: z.string().trim().min(1).max(60),
    pipelineStageId: uuid,
  }).strict().safeParse({
    clinicId,
    name: field(formData, "name"),
    pipelineStageId: field(formData, "pipelineStageId"),
  });
  if (!payload.success) back(path, "error", "invalid_input");
  const result = await updatePipelineStage(payload.data);
  if (!result.ok) back(path, "error", result.code);
  revalidatePipelines();
  back(path, "status", "stage_renamed");
}

/**
 * Ordenação. O contrato exige a lista completa das etapas do pipeline, então a
 * tela envia todas — com as de encerramento nas posições originais. Em caso de
 * falha a ordem gravada permanece intacta e a tela recarrega o estado real: um
 * envio recusado nunca deixa a ordem pela metade.
 */
export async function reorderPipelineStagesAction(formData: FormData) {
  const pipelineId = field(formData, "pipelineId");
  const path = pipelinePath(pipelineId);
  const clinicId = await activeClinicId(PIPELINES_PATH);
  const payload = z.object({
    clinicId: uuid,
    stageIds: z.array(uuid).min(1).max(100),
  }).strict().refine((value) => new Set(value.stageIds).size === value.stageIds.length, {
    message: "Etapas repetidas não são permitidas.",
    path: ["stageIds"],
  }).safeParse({
    clinicId,
    stageIds: field(formData, "stageIds").split(",").filter(Boolean),
  });
  if (!payload.success) back(path, "error", "invalid_input");
  const result = await reorderPipelineStages(payload.data);
  if (!result.ok) back(path, "error", result.code);
  revalidatePipelines();
  back(path, "status", "stages_reordered");
}
