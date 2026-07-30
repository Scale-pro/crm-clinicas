import "server-only";

import { z } from "zod";

import { requirePermission } from "@/shared/auth";
import { createServerSupabaseClient } from "@/shared/db";

import { safeAttachmentMetadataSchema, whatsappMessageTypeSchema } from "./contracts";

type DbError = { code?: string };

function mapConversationError(error: DbError) {
  if (error.code === "42501") return "forbidden" as const;
  if (error.code === "P0002") return "not_found" as const;
  if (error.code === "22023" || error.code === "23514") return "invalid_input" as const;
  if (error.code === "23505") return "duplicate" as const;
  return "unavailable" as const;
}

export async function resolveConversationScope(clinicId: string) {
  const all = await requirePermission(clinicId, "conversation.view_all");
  if (all.allowed) return { ok: true, scope: "all" } as const;
  const own = await requirePermission(clinicId, "conversation.view_own");
  if (own.allowed) return { ok: true, scope: "own", userId: own.session.userId } as const;
  return { ok: false, code: "forbidden" } as const;
}

export const listConversationsSchema = z.object({
  assignedToUserId: z.uuid().nullable().optional().default(null),
  clinicId: z.uuid(),
  page: z.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(40),
  search: z.string().trim().max(160).default(""),
  state: z.enum(["open", "closed"]).nullable().default("open"),
  unreadOnly: z.boolean().default(false),
}).strict();

export async function listConversations(input: unknown) {
  const parsed = listConversationsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const scope = await resolveConversationScope(parsed.data.clinicId);
  if (!scope.ok) return scope;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("search_conversations", {
    p_assigned_to_user_id: parsed.data.assignedToUserId,
    p_clinic_id: parsed.data.clinicId,
    p_page: parsed.data.page,
    p_page_size: parsed.data.pageSize,
    p_search: parsed.data.search,
    p_state: parsed.data.state,
    p_unread_only: parsed.data.unreadOnly,
  });
  if (result.error) return { ok: false, code: "unavailable" } as const;
  const hasMore = result.data.length > parsed.data.pageSize;
  return {
    ok: true,
    conversations: result.data.slice(0, parsed.data.pageSize),
    hasMore,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    scope: scope.scope,
  } as const;
}

const conversationIdSchema = z.object({ clinicId: z.uuid(), conversationId: z.uuid() }).strict();

export async function getConversation(input: unknown) {
  const parsed = conversationIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const scope = await resolveConversationScope(parsed.data.clinicId);
  if (!scope.ok) return scope;
  const supabase = await createServerSupabaseClient();
  const conversation = await supabase.from("conversations")
    .select("id,clinic_id,whatsapp_account_id,contact_id,opportunity_id,assigned_to_user_id,state,needs_reply_from,unread_count,last_message_at,last_read_at,closed_at,version")
    .eq("clinic_id", parsed.data.clinicId).eq("id", parsed.data.conversationId).maybeSingle();
  if (conversation.error) return { ok: false, code: "unavailable" } as const;
  if (!conversation.data) return { ok: false, code: "not_found" } as const;
  const [contact, phones, assignee] = await Promise.all([
    supabase.from("contacts").select("id,full_name").eq("clinic_id", parsed.data.clinicId)
      .eq("id", conversation.data.contact_id).maybeSingle(),
    supabase.from("person_contacts").select("normalized_value,is_primary")
      .eq("clinic_id", parsed.data.clinicId).eq("contact_id", conversation.data.contact_id)
      .eq("kind", "phone").eq("is_whatsapp", true).is("archived_at", null)
      .order("is_primary", { ascending: false }).limit(1),
    conversation.data.assigned_to_user_id
      ? supabase.from("profiles").select("user_id,full_name")
        .eq("user_id", conversation.data.assigned_to_user_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (contact.error || phones.error || assignee.error) {
    return { ok: false, code: "unavailable" } as const;
  }
  return {
    ok: true,
    conversation: {
      ...conversation.data,
      assigneeName: assignee.data?.full_name ?? null,
      contactName: contact.data?.full_name ?? "Contato do WhatsApp",
      phoneE164: phones.data[0]?.normalized_value ?? null,
    },
    scope: scope.scope,
  } as const;
}

export const listConversationMessagesSchema = conversationIdSchema.extend({
  beforeOccurredAt: z.iso.datetime({ offset: true }).nullable().optional().default(null),
  pageSize: z.number().int().min(1).max(100).default(50),
}).strict();

export async function listConversationMessages(input: unknown) {
  const parsed = listConversationMessagesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const scope = await resolveConversationScope(parsed.data.clinicId);
  if (!scope.ok) return scope;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("list_conversation_messages", {
    p_before_occurred_at: parsed.data.beforeOccurredAt,
    p_clinic_id: parsed.data.clinicId,
    p_conversation_id: parsed.data.conversationId,
    p_page_size: parsed.data.pageSize,
  });
  if (result.error) return { ok: false, code: "unavailable" } as const;
  return {
    ok: true,
    hasMore: result.data.length > parsed.data.pageSize,
    messages: result.data.slice(0, parsed.data.pageSize).reverse(),
  } as const;
}

export const assignConversationSchema = conversationIdSchema.extend({
  assignedToUserId: z.uuid(),
}).strict();

export async function assignConversation(input: unknown) {
  const parsed = assignConversationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const permission = await requirePermission(parsed.data.clinicId, "conversation.assign");
  if (!permission.allowed) return { ok: false, code: "forbidden" } as const;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("assign_conversation", {
    p_clinic_id: parsed.data.clinicId,
    p_conversation_id: parsed.data.conversationId,
    p_to_user_id: parsed.data.assignedToUserId,
  });
  if (result.error) return { ok: false, code: mapConversationError(result.error) } as const;
  return { ok: true, version: result.data } as const;
}

export async function markConversationRead(input: unknown) {
  const parsed = conversationIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const scope = await resolveConversationScope(parsed.data.clinicId);
  if (!scope.ok) return scope;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("mark_conversation_read", {
    p_clinic_id: parsed.data.clinicId,
    p_conversation_id: parsed.data.conversationId,
  });
  if (result.error) return { ok: false, code: mapConversationError(result.error) } as const;
  return { ok: true, version: result.data } as const;
}

async function changeConversationState(input: unknown, state: "open" | "closed") {
  const parsed = conversationIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const permission = await requirePermission(parsed.data.clinicId, "conversation.manage");
  if (!permission.allowed) return { ok: false, code: "forbidden" } as const;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("set_conversation_state", {
    p_clinic_id: parsed.data.clinicId,
    p_conversation_id: parsed.data.conversationId,
    p_state: state,
  });
  if (result.error) return { ok: false, code: mapConversationError(result.error) } as const;
  return { ok: true, version: result.data } as const;
}

export const closeConversation = (input: unknown) => changeConversationState(input, "closed");
export const reopenConversation = (input: unknown) => changeConversationState(input, "open");

export async function countUnreadConversations(clinicId: string) {
  const parsed = z.uuid().safeParse(clinicId);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const scope = await resolveConversationScope(parsed.data);
  if (!scope.ok) return scope;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.from("conversations").select("unread_count").eq("clinic_id", parsed.data).gt("unread_count", 0);
  if (result.error) return { ok: false, code: "unavailable" } as const;
  return {
    ok: true,
    conversations: result.data.length,
    messages: result.data.reduce((total, row) => total + row.unread_count, 0),
  } as const;
}

export const createOutboundMessageSchema = conversationIdSchema.extend({
  attachmentMetadata: safeAttachmentMetadataSchema.default({}),
  idempotencyKey: z.uuid(),
  messageType: whatsappMessageTypeSchema,
  textContent: z.string().max(65535).nullable().default(null),
}).strict().refine(
  (value) => value.messageType !== "text" || Boolean(value.textContent?.trim()),
  { message: "Mensagem de texto vazia.", path: ["textContent"] },
);

export async function createOutboundMessage(input: unknown) {
  const parsed = createOutboundMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const permission = await requirePermission(parsed.data.clinicId, "conversation.send");
  if (!permission.allowed) return { ok: false, code: "forbidden" } as const;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("create_whatsapp_outbound_message", {
    p_attachment_metadata: parsed.data.attachmentMetadata,
    p_clinic_id: parsed.data.clinicId,
    p_conversation_id: parsed.data.conversationId,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_message_type: parsed.data.messageType,
    p_text_content: parsed.data.textContent,
  });
  if (result.error) return { ok: false, code: mapConversationError(result.error) } as const;
  const row = result.data[0];
  if (!row) return { ok: false, code: "unavailable" } as const;
  return { ok: true, attemptId: row.attempt_id, messageId: row.message_id } as const;
}
