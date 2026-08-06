import "server-only";

import { z } from "zod";

import { requireAal2, requirePermission } from "@/shared/auth";
import { createServerSupabaseClient } from "@/shared/db";

import { mapCrmError } from "./contacts";

const nullableAmount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable();
const opportunityIdSchema = z.object({ clinicId: z.uuid(), opportunityId: z.uuid() }).strict();

export const createOpportunitySchema = z.object({
  amountCents: nullableAmount.optional().default(null),
  clinicId: z.uuid(),
  confirmedExistingOpen: z.boolean().default(false),
  contactId: z.uuid(),
  idempotencyKey: z.uuid(),
  initialSourceId: z.uuid().nullable().optional().default(null),
  pipelineId: z.uuid().nullable().optional().default(null),
  title: z.string().trim().min(2).max(160),
}).strict();

export const updateOpportunitySchema = z.object({
  amountCents: nullableAmount,
  clinicId: z.uuid(),
  expectedVersion: z.number().int().min(1),
  initialSourceId: z.uuid().nullable(),
  opportunityId: z.uuid(),
  title: z.string().trim().min(2).max(160),
}).strict();

export const moveOpportunitySchema = z.object({
  afterOpportunityId: z.uuid().nullable().optional(),
  beforeOpportunityId: z.uuid().nullable().optional(),
  clinicId: z.uuid(),
  expectedVersion: z.number().int().min(1),
  opportunityId: z.uuid(),
  targetStageId: z.uuid(),
}).strict().refine(
  (value) => value.beforeOpportunityId !== value.opportunityId
    && value.afterOpportunityId !== value.opportunityId,
  { message: "A oportunidade não pode ser sua própria vizinha." },
);

export const closeOpportunitySchema = z.object({
  clinicId: z.uuid(),
  closeReason: z.string().trim().max(500).nullable(),
  expectedVersion: z.number().int().min(1),
  opportunityId: z.uuid(),
  targetStatus: z.enum(["won", "lost"]),
}).strict().refine(
  (value) => value.targetStatus !== "lost"
    || Boolean(value.closeReason && value.closeReason.length >= 2),
  { message: "Informe o motivo da perda.", path: ["closeReason"] },
);

export const reopenOpportunitySchema = z.object({
  clinicId: z.uuid(),
  expectedVersion: z.number().int().min(1),
  opportunityId: z.uuid(),
  reason: z.string().trim().min(2).max(500),
  targetStageId: z.uuid(),
}).strict();

export const assignOpportunitySchema = z.object({
  assignedToUserId: z.uuid(),
  clinicId: z.uuid(),
  expectedVersion: z.number().int().min(1),
  opportunityId: z.uuid(),
}).strict();

const listBoardSchema = z.object({
  assignedToUserId: z.uuid().nullable().optional(),
  clinicId: z.uuid(),
  initialSourceId: z.uuid().nullable().optional(),
  page: z.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(40),
  pipelineId: z.uuid().nullable().optional(),
  search: z.string().trim().max(160).default(""),
  status: z.enum(["open", "won", "lost", "all"]).default("open"),
  /** Só oportunidades com conversa de WhatsApp não lida (mesmo nome de `search_conversations`). */
  unreadOnly: z.boolean().default(false),
}).strict();

export function calculateBoardPosition(
  before: number | null,
  after: number | null,
  last = 0,
): number {
  if (before !== null && after !== null) {
    if (before >= after) throw new Error("invalid_board_neighbors");
    return (before + after) / 2;
  }
  if (before !== null) return before + 1000;
  if (after !== null) return after - 1000;
  return last + 1000;
}

export function sortBoardCards<T extends { board_position: number; id: string }>(cards: readonly T[]): T[] {
  return [...cards].sort((left, right) =>
    left.board_position - right.board_position || left.id.localeCompare(right.id));
}

export async function resolveOpportunityScope(clinicId: string) {
  const all = await requirePermission(clinicId, "opportunity.view_all");
  if (all.allowed) return { ok: true, scope: "all" } as const;
  const own = await requirePermission(clinicId, "opportunity.view_own");
  if (own.allowed) return { ok: true, scope: "own", userId: own.session.userId } as const;
  return { ok: false, code: "forbidden" } as const;
}

async function requireOpportunityMutationScope(
  clinicId: string,
  opportunityId: string,
  kind: "edit" | "move",
) {
  const all = await requirePermission(clinicId, `opportunity.${kind}_all`);
  if (all.allowed) return { ok: true, scope: "all" } as const;
  const own = await requirePermission(clinicId, `opportunity.${kind}_own`);
  if (!own.allowed) return { ok: false, code: "forbidden" } as const;
  const supabase = await createServerSupabaseClient();
  const opportunity = await supabase.from("opportunities").select("assigned_to_user_id")
    .eq("clinic_id", clinicId).eq("id", opportunityId).maybeSingle();
  if (opportunity.error) return { ok: false, code: "unavailable" } as const;
  if (!opportunity.data) return { ok: false, code: "not_found" } as const;
  if (opportunity.data.assigned_to_user_id !== own.session.userId) {
    return { ok: false, code: "forbidden" } as const;
  }
  return { ok: true, scope: "own" } as const;
}

async function listOpportunityBoardInternal(input: unknown) {
  const parsed = listBoardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const scope = await resolveOpportunityScope(parsed.data.clinicId);
  if (!scope.ok) return scope;
  const supabase = await createServerSupabaseClient();
  const allPipelines = parsed.data.pipelineId === null;
  let selectedPipelineId: string | null = parsed.data.pipelineId ?? null;
  let pipeline: {
    data: { archived_at: string | null; id: string; name: string } | null;
    error: unknown;
  } = { data: null, error: null };
  if (!allPipelines) {
    let pipelineQuery = supabase.from("pipelines").select("id,name,archived_at")
      .eq("clinic_id", parsed.data.clinicId);
    pipelineQuery = parsed.data.pipelineId === undefined
      ? pipelineQuery.eq("is_default", true)
      : pipelineQuery.eq("id", parsed.data.pipelineId!);
    pipeline = await pipelineQuery.is("archived_at", null).maybeSingle();
    if (pipeline.error) return { ok: false, code: "unavailable" } as const;
    if (!pipeline.data) return { ok: false, code: "not_found" } as const;
    selectedPipelineId = pipeline.data.id;
  }
  const stages = selectedPipelineId
    ? await supabase.from("pipeline_stages")
      .select("id,name,position,stage_kind").eq("clinic_id", parsed.data.clinicId)
      .eq("pipeline_id", selectedPipelineId).order("position").order("id")
    : { data: [], error: null };
  if (stages.error) return { ok: false, code: "unavailable" } as const;

  const opportunities = await supabase.rpc("search_opportunity_board", {
    p_assigned_to_user_id: parsed.data.assignedToUserId ?? null,
    p_clinic_id: parsed.data.clinicId,
    p_initial_source_id: parsed.data.initialSourceId ?? null,
    p_page: parsed.data.page,
    p_page_size: parsed.data.pageSize,
    p_pipeline_id: selectedPipelineId,
    p_search_term: parsed.data.search,
    p_status: parsed.data.status === "all" ? null : parsed.data.status,
    p_unread_only: parsed.data.unreadOnly,
  });
  if (opportunities.error) return { ok: false, code: "unavailable" } as const;

  const hasMore = opportunities.data.length > parsed.data.pageSize;
  const pageRows = opportunities.data.slice(0, parsed.data.pageSize);
  const sourceIds = [...new Set(pageRows.flatMap((item) => item.initial_source_id ? [item.initial_source_id] : []))];
  const assigneeIds = [...new Set(pageRows.flatMap((item) => item.assigned_to_user_id ? [item.assigned_to_user_id] : []))];
  const sources = sourceIds.length
    ? await supabase.from("lead_sources").select("id,name").in("id", sourceIds)
    : { data: [], error: null };
  const profiles = assigneeIds.length
    ? await supabase.from("profiles").select("user_id,full_name").in("user_id", assigneeIds)
    : { data: [], error: null };
  if (sources.error || profiles.error) return { ok: false, code: "unavailable" } as const;
  const sourceNames = new Map(sources.data.map((item) => [item.id, item.name]));
  const assigneeNames = new Map(profiles.data.map((item) => [item.user_id, item.full_name]));
  const cards = pageRows.map((item) => ({
    ...item,
    assigneeName: item.assigned_to_user_id
      ? assigneeNames.get(item.assigned_to_user_id) ?? "Membro da clínica"
      : "Sem responsável",
    contactName: item.contact_name,
    sourceName: item.initial_source_id
      ? sourceNames.get(item.initial_source_id) ?? "Origem arquivada"
      : null,
  }));
  return {
    ok: true,
    cards,
    hasMore,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    pipeline: pipeline.data,
    scope: scope.scope,
    stages: stages.data,
  } as const;
}

export async function listOpportunityBoard(input: unknown) {
  const result = await listOpportunityBoardInternal(input);
  if (!result.ok) return result;
  if (result.pipeline === null) {
    return { ok: false, code: "invalid_input" } as const;
  }
  return { ...result, pipeline: result.pipeline } as const;
}

export async function listOpportunitiesByPipeline(input: unknown) {
  const parsed = listBoardSchema.safeParse(input);
  if (!parsed.success || !parsed.data.pipelineId) {
    return { ok: false, code: "invalid_input" } as const;
  }
  return listOpportunityBoard(parsed.data);
}

export async function listAllOpportunities(input: unknown) {
  const parsed = listBoardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  return listOpportunityBoardInternal({ ...parsed.data, pipelineId: null });
}

export async function getOpportunityPermissions(clinicId: string) {
  const keys = ["edit_all", "edit_own", "move_all", "move_own", "close", "reopen"] as const;
  const values = await Promise.all(keys.map(async (key) => {
    const result = await requirePermission(clinicId, `opportunity.${key}`);
    return [key, result.allowed] as const;
  }));
  return Object.fromEntries(values) as Record<(typeof keys)[number], boolean>;
}

export async function getOpportunity(input: unknown) {
  const parsed = opportunityIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const scope = await resolveOpportunityScope(parsed.data.clinicId);
  if (!scope.ok) return scope;
  const supabase = await createServerSupabaseClient();
  const opportunity = await supabase.from("opportunities").select("*")
    .eq("clinic_id", parsed.data.clinicId).eq("id", parsed.data.opportunityId).maybeSingle();
  if (opportunity.error) return { ok: false, code: "unavailable" } as const;
  if (!opportunity.data) return { ok: false, code: "not_found" } as const;
  const contact = await supabase.from("contacts").select("id,full_name")
    .eq("clinic_id", parsed.data.clinicId).eq("id", opportunity.data.contact_id).maybeSingle();
  const pipeline = await supabase.from("pipelines").select("id,name")
    .eq("clinic_id", parsed.data.clinicId).eq("id", opportunity.data.pipeline_id).maybeSingle();
  const stages = await supabase.from("pipeline_stages").select("id,name,position,stage_kind")
    .eq("clinic_id", parsed.data.clinicId).eq("pipeline_id", opportunity.data.pipeline_id).order("position");
  const source = opportunity.data.initial_source_id
    ? await supabase.from("lead_sources").select("id,name").eq("clinic_id", parsed.data.clinicId)
      .eq("id", opportunity.data.initial_source_id).maybeSingle()
    : { data: null, error: null };
  const events = await supabase.from("opportunity_stage_events").select("*")
    .eq("clinic_id", parsed.data.clinicId).eq("opportunity_id", parsed.data.opportunityId)
    .order("occurred_at", { ascending: false }).order("id", { ascending: false });
  const members = await supabase.from("clinic_members").select("user_id,role,status")
    .eq("clinic_id", parsed.data.clinicId).eq("status", "active").order("role").order("user_id");
  if (contact.error || pipeline.error || stages.error || source.error || events.error || members.error) {
    return { ok: false, code: "unavailable" } as const;
  }
  const memberIds = members.data.map((member) => member.user_id);
  const profiles = memberIds.length
    ? await supabase.from("profiles").select("user_id,full_name").in("user_id", memberIds)
    : { data: [], error: null };
  if (profiles.error) return { ok: false, code: "unavailable" } as const;
  const names = new Map(profiles.data.map((profile) => [profile.user_id, profile.full_name]));
  return {
    ok: true,
    contact: contact.data,
    events: events.data,
    members: members.data.map((member) => ({ ...member, fullName: names.get(member.user_id) ?? "Membro da clínica" })),
    opportunity: opportunity.data,
    permissions: await getOpportunityPermissions(parsed.data.clinicId),
    pipeline: pipeline.data,
    source: source.data,
    scope: scope.scope,
    stages: stages.data,
  } as const;
}

export async function createOpportunity(input: unknown) {
  const parsed = createOpportunitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const permission = await requirePermission(parsed.data.clinicId, "opportunity.create");
  if (!permission.allowed) return { ok: false, code: "forbidden" } as const;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("create_opportunity", {
    amount_cents: parsed.data.amountCents, clinic_id: parsed.data.clinicId,
    confirmed_existing_open: parsed.data.confirmedExistingOpen,
    contact_id: parsed.data.contactId, idempotency_key: parsed.data.idempotencyKey,
    initial_source_id: parsed.data.initialSourceId, pipeline_id: parsed.data.pipelineId,
    title: parsed.data.title,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  const row = result.data[0];
  if (!row) return { ok: false, code: "unavailable" } as const;
  if (row.has_existing_open && !row.opportunity_id) {
    return { ok: false, code: "existing_open", needsConfirmation: true } as const;
  }
  if (!row.opportunity_id) return { ok: false, code: "unavailable" } as const;
  return { ok: true, hasExistingOpen: row.has_existing_open, opportunityId: row.opportunity_id } as const;
}

export async function updateOpportunity(input: unknown) {
  const parsed = updateOpportunitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireOpportunityMutationScope(
    parsed.data.clinicId, parsed.data.opportunityId, "edit",
  );
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("update_opportunity", {
    amount_cents: parsed.data.amountCents, clinic_id: parsed.data.clinicId,
    expected_version: parsed.data.expectedVersion, initial_source_id: parsed.data.initialSourceId,
    opportunity_id: parsed.data.opportunityId, title: parsed.data.title,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true, version: result.data } as const;
}

export async function moveOpportunity(input: unknown) {
  const parsed = moveOpportunitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireOpportunityMutationScope(
    parsed.data.clinicId, parsed.data.opportunityId, "move",
  );
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("move_opportunity", {
    after_opportunity_id: parsed.data.afterOpportunityId ?? null,
    before_opportunity_id: parsed.data.beforeOpportunityId ?? null,
    clinic_id: parsed.data.clinicId, expected_version: parsed.data.expectedVersion,
    opportunity_id: parsed.data.opportunityId, target_stage_id: parsed.data.targetStageId,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true, version: result.data } as const;
}

export async function closeOpportunity(input: unknown) {
  const parsed = closeOpportunitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const closeAccess = await requirePermission(parsed.data.clinicId, "opportunity.close");
  if (!closeAccess.allowed) return { ok: false, code: "forbidden" } as const;
  const moveAccess = await requireOpportunityMutationScope(
    parsed.data.clinicId, parsed.data.opportunityId, "move",
  );
  if (!moveAccess.ok) {
    const editAccess = await requireOpportunityMutationScope(
      parsed.data.clinicId, parsed.data.opportunityId, "edit",
    );
    if (!editAccess.ok) return { ok: false, code: "forbidden" } as const;
  }
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("close_opportunity", {
    clinic_id: parsed.data.clinicId, close_reason: parsed.data.closeReason,
    expected_version: parsed.data.expectedVersion, opportunity_id: parsed.data.opportunityId,
    target_status: parsed.data.targetStatus,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true, version: result.data } as const;
}

export async function reopenOpportunity(input: unknown) {
  const parsed = reopenOpportunitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const permission = await requirePermission(parsed.data.clinicId, "opportunity.reopen");
  if (!permission.allowed) return { ok: false, code: "forbidden" } as const;
  const aal2 = await requireAal2();
  if (!aal2.allowed) return { ok: false, code: aal2.code } as const;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("reopen_opportunity", {
    clinic_id: parsed.data.clinicId, expected_version: parsed.data.expectedVersion,
    opportunity_id: parsed.data.opportunityId, reason: parsed.data.reason,
    target_stage_id: parsed.data.targetStageId,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true, version: result.data } as const;
}

export async function assignOpportunity(input: unknown) {
  const parsed = assignOpportunitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const permission = await requirePermission(parsed.data.clinicId, "opportunity.edit_all");
  if (!permission.allowed) return { ok: false, code: "forbidden" } as const;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("assign_opportunity", {
    assigned_to_user_id: parsed.data.assignedToUserId, clinic_id: parsed.data.clinicId,
    expected_version: parsed.data.expectedVersion, opportunity_id: parsed.data.opportunityId,
  });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true, version: result.data } as const;
}

export function canReopenAt(closedAt: string, now = new Date()): boolean {
  const closed = new Date(closedAt);
  return Number.isFinite(closed.getTime()) && closed <= now
    && now.getTime() - closed.getTime() <= 24 * 60 * 60 * 1000;
}
