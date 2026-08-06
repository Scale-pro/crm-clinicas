import "server-only";

import { prepareWhatsAppLeadCandidate } from "@/modules/crm";
import type { QueuePublisher } from "@/shared/queue";

import {
  ingestWhatsAppEventSchema,
  normalizedWhatsAppMessageSchema,
  sanitizeWhatsAppPayload,
} from "./contracts";

export type PersistedWhatsAppEvent = {
  readonly duplicate: boolean;
  readonly eventId: string;
};

export type ProcessedWhatsAppMessage = {
  readonly contactId: string;
  readonly conversationId: string;
  readonly duplicate: boolean;
  readonly eventId: string;
  readonly messageId: string;
  readonly opportunityId: string;
};

export interface WhatsAppEventStore {
  ingest(input: {
    accountExternalId: string;
    eventType: string;
    externalEventId: string;
    provider: string;
    rawPayload: Record<string, unknown>;
  }): Promise<PersistedWhatsAppEvent>;
  processMessage(input: {
    attachmentMetadata: Record<string, unknown>;
    contactName: string;
    direction: "inbound" | "outbound";
    eventId: string;
    externalMessageId: string;
    messageType: "text" | "audio" | "image" | "video" | "document" | "location" | "contact" | "unknown";
    occurredAt: string;
    phoneE164: string;
    providerPayloadType: string | null;
    textContent: string | null;
  }): Promise<ProcessedWhatsAppMessage | { errorCode: string }>;
  retry(eventId: string): Promise<boolean>;
}

export async function ingestWhatsAppEvent(
  input: unknown,
  dependencies: { queue: QueuePublisher; store: WhatsAppEventStore },
) {
  const parsed = ingestWhatsAppEventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  try {
    const persisted = await dependencies.store.ingest({
      ...parsed.data,
      rawPayload: sanitizeWhatsAppPayload(parsed.data.rawPayload) as Record<string, unknown>,
    });

    /*
     * O enfileiramento é tentado inclusive quando o evento já estava persistido.
     * Sair cedo no duplicado deixaria órfão todo evento cuja primeira tentativa
     * persistiu mas não enfileirou: a reentrega do provedor cairia aqui, veria
     * `duplicate` e devolveria 200 sem nunca colocar mensagem na fila. Publicar
     * de novo é seguro — `dedupeKey` é o próprio eventId e o processamento é
     * idempotente.
     */
    const queued = await dependencies.queue.publish({
      kind: "whatsapp.process-event",
      dedupeKey: persisted.eventId,
      payload: { eventId: persisted.eventId },
    });

    /*
     * Persistiu mas não enfileirou não é sucesso. Responder ok aqui faria o
     * provedor parar de reentregar um evento que ninguém vai processar; devolver
     * falha mantém a reentrega, que é o caminho de recuperação mais rápido.
     * O evento continua durável, e `retry_whatsapp_event` aceita `pending`
     * justamente para reprocessar o que o provedor não reentregar.
     */
    if (!queued.enqueued) {
      return {
        ok: false,
        code: "not_queued",
        eventId: persisted.eventId,
        queueCode: queued.code,
      } as const;
    }

    return {
      ok: true,
      duplicate: persisted.duplicate,
      eventId: persisted.eventId,
      queued: true,
      queueCode: queued.code,
    } as const;
  } catch {
    return { ok: false, code: "unavailable" } as const;
  }
}

export async function processWhatsAppEvent(
  input: unknown,
  dependencies: { store: WhatsAppEventStore },
) {
  const parsed = normalizedWhatsAppMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const lead = prepareWhatsAppLeadCandidate({
    contactName: parsed.data.contactName,
    eventId: parsed.data.eventId,
    phone: parsed.data.phone,
  });
  if (!lead.ok) return { ok: false, code: lead.code } as const;
  try {
    const processed = await dependencies.store.processMessage({
      ...parsed.data,
      phoneE164: lead.candidate.phoneE164,
    });
    if ("errorCode" in processed) {
      return { ok: false, code: "processing_failed", retryable: true } as const;
    }
    return { ok: true, ...processed } as const;
  } catch {
    return { ok: false, code: "processing_failed", retryable: true } as const;
  }
}

export async function reprocessWhatsAppEvent(
  eventId: string,
  dependencies: { queue: QueuePublisher; store: WhatsAppEventStore },
) {
  const parsed = normalizedWhatsAppMessageSchema.shape.eventId.safeParse(eventId);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  try {
    if (!await dependencies.store.retry(parsed.data)) {
      return { ok: false, code: "not_retryable" } as const;
    }
    const queued = await dependencies.queue.publish({
      kind: "whatsapp.process-event",
      dedupeKey: `retry:${parsed.data}`,
      payload: { eventId: parsed.data },
    });
    return { ok: true, queued: queued.enqueued, queueCode: queued.code } as const;
  } catch {
    return { ok: false, code: "unavailable" } as const;
  }
}
