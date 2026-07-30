import "server-only";

import { z } from "zod";

import { whatsappDeliveryStatusSchema } from "./contracts";
import type { WhatsAppEventStore } from "./ingest";

type RpcResult = { data: unknown; error: unknown };

/** Porta mínima; a composição do webhook fornece um executor técnico autorizado. */
export interface WhatsAppRpcExecutor {
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
}

const persistedEventSchema = z.array(z.object({
  duplicate: z.boolean(),
  event_id: z.uuid(),
}).strict()).min(1).max(1);

const processedMessageSchema = z.array(z.object({
  contact_id: z.uuid().nullable(),
  conversation_id: z.uuid().nullable(),
  duplicate: z.boolean(),
  error_code: z.string().nullable(),
  event_id: z.uuid(),
  message_id: z.uuid().nullable(),
  opportunity_id: z.uuid().nullable(),
}).strict()).min(1).max(1);

export function createWhatsAppRpcStore(executor: WhatsAppRpcExecutor): WhatsAppEventStore {
  return {
    async ingest(input) {
      const result = await executor.rpc("ingest_whatsapp_event", {
        p_account_external_id: input.accountExternalId,
        p_event_type: input.eventType,
        p_external_event_id: input.externalEventId,
        p_provider: input.provider,
        p_raw_payload: input.rawPayload,
      });
      if (result.error) throw new Error("whatsapp_ingest_failed");
      const parsed = persistedEventSchema.safeParse(result.data);
      if (!parsed.success) throw new Error("whatsapp_ingest_invalid_result");
      const row = parsed.data[0];
      if (!row) throw new Error("whatsapp_ingest_invalid_result");
      return { duplicate: row.duplicate, eventId: row.event_id };
    },
    async processMessage(input) {
      const result = await executor.rpc("process_whatsapp_message", {
        p_attachment_metadata: input.attachmentMetadata,
        p_contact_name: input.contactName,
        p_direction: input.direction,
        p_event_id: input.eventId,
        p_external_message_id: input.externalMessageId,
        p_message_type: input.messageType,
        p_occurred_at: input.occurredAt,
        p_phone: input.phoneE164,
        p_provider_payload_type: input.providerPayloadType,
        p_text_content: input.textContent,
      });
      if (result.error) throw new Error("whatsapp_processing_failed");
      const parsed = processedMessageSchema.safeParse(result.data);
      if (!parsed.success) throw new Error("whatsapp_processing_invalid_result");
      const row = parsed.data[0];
      if (!row) throw new Error("whatsapp_processing_invalid_result");
      if (row.error_code || !row.contact_id || !row.conversation_id
        || !row.message_id || !row.opportunity_id) {
        return { errorCode: row.error_code ?? "processing_failed" };
      }
      return {
        contactId: row.contact_id,
        conversationId: row.conversation_id,
        duplicate: row.duplicate,
        eventId: row.event_id,
        messageId: row.message_id,
        opportunityId: row.opportunity_id,
      };
    },
    async retry(eventId) {
      const result = await executor.rpc("retry_whatsapp_event", { p_event_id: eventId });
      if (result.error || typeof result.data !== "boolean") {
        throw new Error("whatsapp_retry_failed");
      }
      return result.data;
    },
  };
}

const statusInputSchema = z.object({
  externalMessageId: z.string().min(1).max(240),
  occurredAt: z.iso.datetime({ offset: true }),
  status: whatsappDeliveryStatusSchema,
  webhookEventId: z.uuid(),
}).strict();

export async function recordWhatsAppMessageStatus(
  input: unknown,
  executor: WhatsAppRpcExecutor,
) {
  const parsed = statusInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  try {
    const result = await executor.rpc("record_whatsapp_message_status", {
      p_external_message_id: parsed.data.externalMessageId,
      p_occurred_at: parsed.data.occurredAt,
      p_status: parsed.data.status,
      p_webhook_event_id: parsed.data.webhookEventId,
    });
    if (result.error) return { ok: false, code: "unavailable" } as const;
    return { ok: true } as const;
  } catch {
    return { ok: false, code: "unavailable" } as const;
  }
}
