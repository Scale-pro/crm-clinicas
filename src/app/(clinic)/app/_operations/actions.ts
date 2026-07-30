"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  archiveProcedure,
  archiveProfessional,
  archiveProfessionalProcedure,
  createProcedure,
  createProfessional,
  getProcedure,
  getProfessional,
  getProfessionalWeeklyAvailability,
  linkProfessionalUser,
  setProfessionalProcedure,
  setProfessionalSpecialties,
  setProfessionalWeeklyAvailability,
  unlinkProfessionalUser,
  updateProcedure,
  updateProfessional,
} from "@/modules/scheduling";
import { resolveActiveClinicContext } from "@/modules/tenancy";

import { agendaColorToHex } from "./agenda-color";
import {
  intervalsFromAvailabilityDraft,
  sameIntervals,
  type WeeklyInterval,
} from "./operations-adapters";
import { schedulingErrorMessage } from "./operations-errors";
import {
  MAX_SPECIALTIES,
  MIN_PROCEDURE_MINUTES,
  WEEKDAY_KEYS,
  type WeeklyAvailabilityDraft,
} from "./operations-validation";

/**
 * Server Actions da área de operações da clínica.
 *
 * São deliberadamente finas: cada uma existe apenas para ligar a interface a um
 * contrato público que já existe em `@/modules/scheduling`. Nenhuma regra de
 * negócio, nenhuma consulta ao banco e nenhum SQL vivem aqui.
 *
 * Invariantes desta camada:
 *
 * - o `clinicId` é **sempre** resolvido no servidor por
 *   `resolveActiveClinicContext()`; o navegador nunca informa a clínica;
 * - toda entrada passa por Zod antes de chegar ao módulo, que valida de novo;
 * - criações levam um `idempotencyKey` novo gerado no servidor;
 * - atualizações levam `expectedVersion` — a concorrência otimista é do banco;
 * - a resposta só carrega código e mensagem escritos por nós: nenhuma mensagem
 *   do Postgres, SQLSTATE, nome de RPC ou detalhe interno atravessa a fronteira;
 * - autorização e MFA continuam sendo decididos pelo módulo/banco. Esconder um
 *   botão na interface é conforto, não controle de acesso.
 */

const PROFESSIONALS_PATH = "/app/settings/professionals";
const PROCEDURES_PATH = "/app/settings/procedures";

export type OperationsActionResult =
  | {
    readonly ok: true;
    /** Identificador do registro criado, quando a ação cria algo. */
    readonly id?: string;
    /** O principal foi salvo, mas um passo complementar falhou. */
    readonly warning?: string;
  }
  | {
    readonly ok: false;
    /** Código do vocabulário de `@/modules/scheduling`, nunca do banco. */
    readonly code: string;
    readonly message: string;
  };

function failure(code: string): OperationsActionResult {
  return { code, message: schedulingErrorMessage(code), ok: false };
}

const NO_ACTIVE_CLINIC: OperationsActionResult = {
  code: "clinic_unavailable",
  message: "Não foi possível identificar a clínica ativa. Atualize a página e tente novamente.",
  ok: false,
};

const INVALID_INPUT = failure("invalid_input");

/** Única origem do tenant. Nunca há um `clinicId` vindo do formulário. */
async function activeClinicId(): Promise<string | null> {
  const context = await resolveActiveClinicContext();
  return context.status === "ready" ? context.clinic.id : null;
}

// ---------------------------------------------------------------------------
// Esquemas de entrada
// ---------------------------------------------------------------------------

const uuidSchema = z.uuid();
const timeSchema = z.string().regex(/^\d{1,2}:\d{2}$/);

const daySchema = z.object({
  enabled: z.boolean(),
  ranges: z.array(z.object({
    end: timeSchema,
    id: z.string().max(64),
    start: timeSchema,
  })).max(12),
}).strict();

const availabilitySchema = z.object(
  Object.fromEntries(WEEKDAY_KEYS.map((key) => [key, daySchema])) as Record<
    (typeof WEEKDAY_KEYS)[number],
    typeof daySchema
  >,
).strict();

const professionalInputSchema = z.object({
  availability: availabilitySchema,
  colorToken: z.string().max(40),
  displayName: z.string().max(200),
  email: z.string().max(320),
  linkedUserId: uuidSchema.nullable(),
  notes: z.string().max(2000),
  phone: z.string().max(32),
  registrationNumber: z.string().max(80),
  registrationType: z.string().max(40),
  specialties: z.array(z.string().max(80)).max(MAX_SPECIALTIES),
  status: z.enum(["active", "inactive"]),
}).strict();

const createProfessionalInputSchema = professionalInputSchema;
const updateProfessionalInputSchema = professionalInputSchema.extend({
  expectedVersion: z.number().int().min(1),
  professionalId: uuidSchema,
}).strict();

const procedureInputSchema = z.object({
  basePriceCents: z.number().int().min(0),
  category: z.string().max(100),
  colorToken: z.string().max(40),
  description: z.string().max(2000),
  durationMinutes: z.number().int().min(MIN_PROCEDURE_MINUTES).max(1440),
  name: z.string().max(200),
  status: z.enum(["active", "inactive"]),
}).strict();

const updateProcedureInputSchema = procedureInputSchema.extend({
  expectedVersion: z.number().int().min(1),
  procedureId: uuidSchema,
}).strict();

const statusChangeSchema = z.object({
  expectedVersion: z.number().int().min(1),
  id: uuidSchema,
  status: z.enum(["active", "inactive"]),
}).strict();

const archiveSchema = z.object({ id: uuidSchema }).strict();

const professionalLinksSchema = z.object({
  links: z.array(z.object({
    durationMinutesOverride: z.number().int().min(MIN_PROCEDURE_MINUTES).max(1440).nullable(),
    enabled: z.boolean(),
    expectedVersion: z.number().int().min(1).nullable(),
    priceCentsOverride: z.number().int().min(0).nullable(),
    professionalId: uuidSchema,
    professionalProcedureId: uuidSchema.nullable(),
  })).max(100),
  procedureId: uuidSchema,
}).strict();

// ---------------------------------------------------------------------------
// Normalização de campos opcionais
// ---------------------------------------------------------------------------

/** Texto vazio vira ausência de valor — o backend distingue `null` de `""`. */
function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Só os dígitos seguem para o backend, que normaliza para E.164 (ADR-006). */
function optionalPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits === "" ? null : digits;
}

// ---------------------------------------------------------------------------
// Profissionais
// ---------------------------------------------------------------------------

/**
 * Grava especialidades, disponibilidade e vínculo de usuário depois do núcleo
 * do cadastro.
 *
 * Cada passo é uma RPC própria e nenhuma delas participa da mesma transação do
 * núcleo — por isso a falha aqui é reportada como aviso, e não como fracasso: o
 * profissional existe e a pessoa consegue corrigir o passo que faltou pelo
 * detalhe, sem recadastrar.
 */
async function applyProfessionalDetails(
  clinicId: string,
  professionalId: string,
  input: z.infer<typeof professionalInputSchema>,
  currentUserId: string | null,
): Promise<string | null> {
  const specialties = await setProfessionalSpecialties({
    clinicId,
    professionalId,
    specialties: input.specialties,
  });
  if (!specialties.ok) return schedulingErrorMessage(specialties.code);

  const desired = intervalsFromAvailabilityDraft(input.availability as WeeklyAvailabilityDraft);
  if (desired === null) return schedulingErrorMessage("invalid_availability");

  // A versão vem de uma leitura fresca porque o próprio núcleo do cadastro
  // acabou de incrementá-la; a concorrência otimista do registro já foi
  // verificada no passo anterior.
  const current = await getProfessionalWeeklyAvailability({ clinicId, professionalId });
  if (!current.ok) return schedulingErrorMessage(current.code);
  const currentIntervals: readonly WeeklyInterval[] = current.intervals.map((interval) => ({
    endMinute: interval.endMinute,
    startMinute: interval.startMinute,
    weekday: interval.weekday,
  }));
  if (!sameIntervals(desired, currentIntervals)) {
    const saved = await setProfessionalWeeklyAvailability({
      clinicId,
      expectedVersion: current.version,
      intervals: desired,
      professionalId,
    });
    if (!saved.ok) return schedulingErrorMessage(saved.code);
  }

  if (input.linkedUserId === currentUserId) return null;
  const link = input.linkedUserId === null
    ? await unlinkProfessionalUser({ clinicId, professionalId })
    : await linkProfessionalUser({ clinicId, professionalId, userId: input.linkedUserId });
  return link.ok ? null : schedulingErrorMessage(link.code);
}

export async function createProfessionalAction(input: unknown): Promise<OperationsActionResult> {
  const parsed = createProfessionalInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const clinicId = await activeClinicId();
  if (!clinicId) return NO_ACTIVE_CLINIC;

  const created = await createProfessional({
    clinicId,
    color: agendaColorToHex(parsed.data.colorToken),
    displayName: parsed.data.displayName.trim(),
    email: optional(parsed.data.email),
    idempotencyKey: randomUUID(),
    notes: optional(parsed.data.notes),
    phone: optionalPhone(parsed.data.phone),
    professionalRegistrationNumber: optional(parsed.data.registrationType) === null
      ? null
      : optional(parsed.data.registrationNumber),
    professionalRegistrationType: optional(parsed.data.registrationType),
  });
  if (!created.ok) return failure(created.code);
  const professionalId = created.professionalId;

  // O cadastro nasce ativo pelo contrato do backend. Quando a pessoa escolheu
  // "Inativo" no formulário, a situação é aplicada logo em seguida — o campo
  // não pode aparentar ter sido salvo sem ter sido. Os dois passos seguintes
  // rodam sempre: uma falha em um deles não pode cancelar o outro.
  const statusWarning = parsed.data.status === "inactive"
    ? await applyProfessionalStatus(clinicId, professionalId, "inactive")
    : null;
  const detailWarning = await applyProfessionalDetails(clinicId, professionalId, parsed.data, null);
  const warning = statusWarning ?? detailWarning;

  revalidatePath(PROFESSIONALS_PATH);
  return warning ? { id: professionalId, ok: true, warning } : { id: professionalId, ok: true };
}

/**
 * Troca apenas a situação, relendo o cadastro no servidor. Devolve a mensagem
 * de falha ou `null` em caso de sucesso.
 */
async function applyProfessionalStatus(
  clinicId: string,
  professionalId: string,
  status: "active" | "inactive",
): Promise<string | null> {
  const existing = await getProfessional({ clinicId, professionalId });
  if (!existing.ok) return schedulingErrorMessage(existing.code);
  const professional = existing.professional;
  if (professional.status === status) return null;
  const updated = await updateProfessional({
    clinicId,
    color: professional.color,
    displayName: professional.displayName,
    email: professional.email,
    expectedVersion: professional.version,
    notes: professional.notes,
    phone: professional.phone,
    professionalId,
    professionalRegistrationNumber: professional.professionalRegistrationNumber,
    professionalRegistrationType: professional.professionalRegistrationType,
    status,
  });
  return updated.ok ? null : schedulingErrorMessage(updated.code);
}

export async function updateProfessionalAction(input: unknown): Promise<OperationsActionResult> {
  const parsed = updateProfessionalInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const clinicId = await activeClinicId();
  if (!clinicId) return NO_ACTIVE_CLINIC;
  const { professionalId } = parsed.data;

  const existing = await getProfessional({ clinicId, professionalId });
  if (!existing.ok) return failure(existing.code);

  const updated = await updateProfessional({
    clinicId,
    color: agendaColorToHex(parsed.data.colorToken),
    displayName: parsed.data.displayName.trim(),
    email: optional(parsed.data.email),
    expectedVersion: parsed.data.expectedVersion,
    notes: optional(parsed.data.notes),
    phone: optionalPhone(parsed.data.phone),
    professionalId,
    professionalRegistrationNumber: optional(parsed.data.registrationType) === null
      ? null
      : optional(parsed.data.registrationNumber),
    professionalRegistrationType: optional(parsed.data.registrationType),
    status: parsed.data.status,
  });
  if (!updated.ok) return failure(updated.code);

  const warning = await applyProfessionalDetails(
    clinicId,
    professionalId,
    parsed.data,
    existing.professional.userId,
  );
  revalidatePath(PROFESSIONALS_PATH);
  revalidatePath(`${PROFESSIONALS_PATH}/${professionalId}`);
  return warning ? { ok: true, warning } : { ok: true };
}

/**
 * Ativa ou desativa sem abrir o formulário. Os demais campos vêm da leitura no
 * servidor — o navegador informa apenas qual situação quer e em cima de qual
 * versão, nunca o conteúdo do cadastro.
 */
export async function setProfessionalStatusAction(input: unknown): Promise<OperationsActionResult> {
  const parsed = statusChangeSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const clinicId = await activeClinicId();
  if (!clinicId) return NO_ACTIVE_CLINIC;

  const existing = await getProfessional({ clinicId, professionalId: parsed.data.id });
  if (!existing.ok) return failure(existing.code);
  const professional = existing.professional;

  const updated = await updateProfessional({
    clinicId,
    color: professional.color,
    displayName: professional.displayName,
    email: professional.email,
    expectedVersion: parsed.data.expectedVersion,
    notes: professional.notes,
    phone: professional.phone,
    professionalId: parsed.data.id,
    professionalRegistrationNumber: professional.professionalRegistrationNumber,
    professionalRegistrationType: professional.professionalRegistrationType,
    status: parsed.data.status,
  });
  if (!updated.ok) return failure(updated.code);
  revalidatePath(PROFESSIONALS_PATH);
  revalidatePath(`${PROFESSIONALS_PATH}/${parsed.data.id}`);
  return { ok: true };
}

export async function archiveProfessionalAction(input: unknown): Promise<OperationsActionResult> {
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const clinicId = await activeClinicId();
  if (!clinicId) return NO_ACTIVE_CLINIC;

  const result = await archiveProfessional({ clinicId, professionalId: parsed.data.id });
  if (!result.ok) return failure(result.code);
  revalidatePath(PROFESSIONALS_PATH);
  revalidatePath(`${PROFESSIONALS_PATH}/${parsed.data.id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Procedimentos
// ---------------------------------------------------------------------------

export async function createProcedureAction(input: unknown): Promise<OperationsActionResult> {
  const parsed = procedureInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const clinicId = await activeClinicId();
  if (!clinicId) return NO_ACTIVE_CLINIC;

  const created = await createProcedure({
    clinicId,
    basePriceCents: parsed.data.basePriceCents,
    category: optional(parsed.data.category),
    color: agendaColorToHex(parsed.data.colorToken),
    defaultDurationMinutes: parsed.data.durationMinutes,
    description: optional(parsed.data.description),
    idempotencyKey: randomUUID(),
    name: parsed.data.name.trim(),
  });
  if (!created.ok) return failure(created.code);

  // Mesmo motivo do profissional: o procedimento nasce ativo, então "Inativo"
  // escolhido no formulário precisa ser aplicado de verdade.
  const warning = parsed.data.status === "inactive"
    ? await applyProcedureStatus(clinicId, created.procedureId, "inactive")
    : null;

  revalidatePath(PROCEDURES_PATH);
  return warning
    ? { id: created.procedureId, ok: true, warning }
    : { id: created.procedureId, ok: true };
}

async function applyProcedureStatus(
  clinicId: string,
  procedureId: string,
  status: "active" | "inactive",
): Promise<string | null> {
  const existing = await getProcedure({ clinicId, procedureId });
  if (!existing.ok) return schedulingErrorMessage(existing.code);
  const procedure = existing.procedure;
  if (procedure.status === status) return null;
  const updated = await updateProcedure({
    clinicId,
    basePriceCents: procedure.basePriceCents,
    category: procedure.category,
    color: procedure.color,
    defaultDurationMinutes: procedure.defaultDurationMinutes,
    description: procedure.description,
    expectedVersion: procedure.version,
    name: procedure.name,
    procedureId,
    status,
  });
  return updated.ok ? null : schedulingErrorMessage(updated.code);
}

export async function updateProcedureAction(input: unknown): Promise<OperationsActionResult> {
  const parsed = updateProcedureInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const clinicId = await activeClinicId();
  if (!clinicId) return NO_ACTIVE_CLINIC;

  const updated = await updateProcedure({
    clinicId,
    basePriceCents: parsed.data.basePriceCents,
    category: optional(parsed.data.category),
    color: agendaColorToHex(parsed.data.colorToken),
    defaultDurationMinutes: parsed.data.durationMinutes,
    description: optional(parsed.data.description),
    expectedVersion: parsed.data.expectedVersion,
    name: parsed.data.name.trim(),
    procedureId: parsed.data.procedureId,
    status: parsed.data.status,
  });
  if (!updated.ok) return failure(updated.code);
  revalidatePath(PROCEDURES_PATH);
  revalidatePath(`${PROCEDURES_PATH}/${parsed.data.procedureId}`);
  return { ok: true };
}

export async function setProcedureStatusAction(input: unknown): Promise<OperationsActionResult> {
  const parsed = statusChangeSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const clinicId = await activeClinicId();
  if (!clinicId) return NO_ACTIVE_CLINIC;

  const existing = await getProcedure({ clinicId, procedureId: parsed.data.id });
  if (!existing.ok) return failure(existing.code);
  const procedure = existing.procedure;

  const updated = await updateProcedure({
    clinicId,
    basePriceCents: procedure.basePriceCents,
    category: procedure.category,
    color: procedure.color,
    defaultDurationMinutes: procedure.defaultDurationMinutes,
    description: procedure.description,
    expectedVersion: parsed.data.expectedVersion,
    name: procedure.name,
    procedureId: parsed.data.id,
    status: parsed.data.status,
  });
  if (!updated.ok) return failure(updated.code);
  revalidatePath(PROCEDURES_PATH);
  revalidatePath(`${PROCEDURES_PATH}/${parsed.data.id}`);
  return { ok: true };
}

export async function archiveProcedureAction(input: unknown): Promise<OperationsActionResult> {
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const clinicId = await activeClinicId();
  if (!clinicId) return NO_ACTIVE_CLINIC;

  const result = await archiveProcedure({ clinicId, procedureId: parsed.data.id });
  if (!result.ok) return failure(result.code);
  revalidatePath(PROCEDURES_PATH);
  revalidatePath(`${PROCEDURES_PATH}/${parsed.data.id}`);
  return { ok: true };
}

/**
 * Aplica as mudanças de habilitação de profissionais em um procedimento.
 *
 * A interface envia somente os vínculos que mudaram, cada um com a versão que
 * estava na tela: habilitar e personalizar vão por `setProfessionalProcedure`,
 * remover a habilitação vai por `archiveProfessionalProcedure`. Na primeira
 * falha a ação para e revalida a página, para que a tela mostre exatamente o
 * que ficou gravado em vez de um estado otimista.
 */
export async function saveProcedureProfessionalLinksAction(
  input: unknown,
): Promise<OperationsActionResult> {
  const parsed = professionalLinksSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const clinicId = await activeClinicId();
  if (!clinicId) return NO_ACTIVE_CLINIC;
  const { procedureId } = parsed.data;

  function revalidate() {
    revalidatePath(PROCEDURES_PATH);
    revalidatePath(`${PROCEDURES_PATH}/${procedureId}`);
  }

  for (const link of parsed.data.links) {
    if (link.enabled) {
      const saved = await setProfessionalProcedure({
        clinicId,
        durationMinutesOverride: link.durationMinutesOverride,
        expectedVersion: link.expectedVersion,
        priceCentsOverride: link.priceCentsOverride,
        procedureId,
        professionalId: link.professionalId,
      });
      if (!saved.ok) {
        revalidate();
        // Habilitar alguém que nunca apareceu como vinculado e receber conflito
        // de versão só acontece quando existe um vínculo arquivado invisível
        // para as leituras públicas. A mensagem genérica de concorrência
        // mandaria atualizar a página sem que isso resolvesse nada.
        const relinkBlocked = link.expectedVersion === null && saved.code === "stale_version";
        return failure(relinkBlocked ? "professional_procedure_relink_unavailable" : saved.code);
      }
      continue;
    }
    // Sem identificador não havia vínculo: nada a remover.
    if (link.professionalProcedureId === null) continue;
    const removed = await archiveProfessionalProcedure({
      clinicId,
      professionalProcedureId: link.professionalProcedureId,
    });
    if (!removed.ok) {
      revalidate();
      return failure(removed.code);
    }
  }

  revalidate();
  return { ok: true };
}
