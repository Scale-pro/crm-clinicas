"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  archiveContact,
  assignOpportunity,
  closeOpportunity,
  moveOpportunity,
  reopenOpportunity,
  updateOpportunity,
} from "@/modules/crm";
import { resolveActiveClinicContext } from "@/modules/tenancy";

/**
 * Server Actions da cobertura visual do CRM.
 *
 * São finas de propósito: cada uma existe apenas para ligar um formulário a um
 * contrato público que já existe em `@/modules/crm`. Nenhuma regra de negócio,
 * consulta ao banco ou SQL vive aqui.
 *
 * Invariantes desta camada:
 *
 * - o `clinicId` é **sempre** resolvido no servidor por
 *   `resolveActiveClinicContext()`. Diferente das ações herdadas do quadro,
 *   estas **nem leem** um campo `clinicId` do formulário — o navegador não tem
 *   como opinar sobre o tenant, nem para ser rejeitado depois;
 * - toda entrada passa por Zod antes de chegar ao módulo, que valida de novo;
 * - atualizações levam `expectedVersion` — a concorrência otimista é do banco;
 * - o redirecionamento carrega apenas códigos do nosso vocabulário; mensagem do
 *   Postgres, SQLSTATE e nome de RPC não atravessam a fronteira;
 * - a rota afetada é revalidada após sucesso.
 *
 * Autorização continua sendo decidida pelo módulo e pelo banco: esconder um
 * botão na interface é conforto, não controle de acesso.
 */

const uuid = z.uuid();
const version = z.coerce.number().int().min(1);

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Converte reais digitados em centavos. `undefined` sinaliza texto inválido —
 * distinto de `null`, que é "sem valor informado".
 */
function amountInCents(value: string): number | null | undefined {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return undefined;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) ? cents : undefined;
}

/** Única origem do tenant. Não existe `clinicId` de entrada nesta camada. */
async function activeClinicId(fallback: string): Promise<string> {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") redirect(`${fallback}?error=forbidden`);
  return context.clinic.id;
}

function contactPath(contactId: string): string {
  return `/app/contacts/${encodeURIComponent(contactId)}`;
}

function opportunityPath(opportunityId: string): string {
  return `/app/opportunities/${encodeURIComponent(opportunityId)}`;
}

function back(path: string, key: "error" | "status", code: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(code)}`);
}

// ---------------------------------------------------------------------------
// Contatos
// ---------------------------------------------------------------------------

export async function archiveContactAction(formData: FormData) {
  const contactId = field(formData, "contactId");
  const path = contactPath(contactId);
  const clinicId = await activeClinicId(path);
  const payload = z.object({ clinicId: uuid, contactId: uuid }).strict()
    .safeParse({ clinicId, contactId });
  if (!payload.success) back(path, "error", "invalid_input");
  const result = await archiveContact(payload.data);
  if (!result.ok) back(path, "error", result.code);
  revalidatePath("/app/contacts");
  revalidatePath(path);
  back(path, "status", "contact_archived");
}

// ---------------------------------------------------------------------------
// Oportunidades
// ---------------------------------------------------------------------------

function revalidateOpportunity(opportunityId: string) {
  revalidatePath("/app/pipeline");
  revalidatePath("/app/leads");
  revalidatePath(opportunityPath(opportunityId));
}

export async function updateOpportunityAction(formData: FormData) {
  const opportunityId = field(formData, "opportunityId");
  const path = opportunityPath(opportunityId);
  const clinicId = await activeClinicId(path);
  const payload = z.object({
    amountCents: z.number().int().min(0).nullable(),
    clinicId: uuid,
    expectedVersion: version,
    initialSourceId: uuid.nullable(),
    opportunityId: uuid,
    title: z.string().trim().min(2).max(160),
  }).strict().safeParse({
    amountCents: amountInCents(field(formData, "amount")),
    clinicId,
    expectedVersion: field(formData, "expectedVersion"),
    initialSourceId: field(formData, "initialSourceId") || null,
    opportunityId,
    title: field(formData, "title"),
  });
  if (!payload.success) back(path, "error", "invalid_input");
  const result = await updateOpportunity(payload.data);
  if (!result.ok) back(path, "error", result.code);
  revalidateOpportunity(opportunityId);
  back(path, "status", "opportunity_updated");
}

export async function moveOpportunityAction(formData: FormData) {
  const opportunityId = field(formData, "opportunityId");
  const path = opportunityPath(opportunityId);
  const clinicId = await activeClinicId(path);
  const payload = z.object({
    clinicId: uuid,
    expectedVersion: version,
    opportunityId: uuid,
    targetStageId: uuid,
  }).strict().safeParse({
    clinicId,
    expectedVersion: field(formData, "expectedVersion"),
    opportunityId,
    targetStageId: field(formData, "targetStageId"),
  });
  if (!payload.success) back(path, "error", "invalid_input");
  const result = await moveOpportunity(payload.data);
  if (!result.ok) back(path, "error", result.code);
  revalidateOpportunity(opportunityId);
  back(path, "status", "opportunity_moved");
}

export async function assignOpportunityAction(formData: FormData) {
  const opportunityId = field(formData, "opportunityId");
  const path = opportunityPath(opportunityId);
  const clinicId = await activeClinicId(path);
  const payload = z.object({
    assignedToUserId: uuid,
    clinicId: uuid,
    expectedVersion: version,
    opportunityId: uuid,
  }).strict().safeParse({
    assignedToUserId: field(formData, "assignedToUserId"),
    clinicId,
    expectedVersion: field(formData, "expectedVersion"),
    opportunityId,
  });
  if (!payload.success) back(path, "error", "invalid_input");
  const result = await assignOpportunity(payload.data);
  if (!result.ok) back(path, "error", result.code);
  revalidateOpportunity(opportunityId);
  back(path, "status", "opportunity_assigned");
}

/**
 * Ganho e perda. O motivo só acompanha a perda porque é lá que o contrato
 * público o exige — não é campo decorativo: `closeOpportunitySchema` recusa
 * perda sem motivo.
 */
export async function closeOpportunityAction(formData: FormData) {
  const opportunityId = field(formData, "opportunityId");
  const path = opportunityPath(opportunityId);
  const clinicId = await activeClinicId(path);
  const payload = z.object({
    clinicId: uuid,
    closeReason: z.string().trim().max(500).nullable(),
    expectedVersion: version,
    opportunityId: uuid,
    targetStatus: z.enum(["won", "lost"]),
  }).strict().safeParse({
    clinicId,
    closeReason: field(formData, "closeReason") || null,
    expectedVersion: field(formData, "expectedVersion"),
    opportunityId,
    targetStatus: field(formData, "targetStatus"),
  });
  if (!payload.success) back(path, "error", "invalid_input");
  const result = await closeOpportunity(payload.data);
  if (!result.ok) back(path, "error", result.code);
  revalidateOpportunity(opportunityId);
  back(path, "status", payload.data.targetStatus === "won" ? "opportunity_won" : "opportunity_lost");
}

/** Reabertura: o contrato exige motivo, etapa aberta de destino e AAL2. */
export async function reopenOpportunityAction(formData: FormData) {
  const opportunityId = field(formData, "opportunityId");
  const path = opportunityPath(opportunityId);
  const clinicId = await activeClinicId(path);
  const payload = z.object({
    clinicId: uuid,
    expectedVersion: version,
    opportunityId: uuid,
    reason: z.string().trim().min(2).max(500),
    targetStageId: uuid,
  }).strict().safeParse({
    clinicId,
    expectedVersion: field(formData, "expectedVersion"),
    opportunityId,
    reason: field(formData, "reason"),
    targetStageId: field(formData, "targetStageId"),
  });
  if (!payload.success) back(path, "error", "invalid_input");
  const result = await reopenOpportunity(payload.data);
  if (!result.ok) back(path, "error", result.code);
  revalidateOpportunity(opportunityId);
  back(path, "status", "opportunity_reopened");
}
