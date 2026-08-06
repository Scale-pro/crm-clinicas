import { z } from "zod";

import {
  createWhatsAppRpcStore,
  deliverWhatsAppMessage,
  extractEnvelope,
  loadWhatsAppEvent,
  markWhatsAppEventIgnored,
  processWhatsAppEvent,
  recordWhatsAppMessageStatus,
  toNormalizedMessage,
  toStatusUpdate,
} from "@/modules/whatsapp";
import { createTechnicalRpcExecutor } from "@/shared/db";
import { logger } from "@/shared/observability";
import { verifyQStashSignature } from "@/shared/queue";

/**
 * Worker da fila (ADR-008/ADR-009).
 *
 * Contrato de resposta ao QStash, e é aqui que mora a diferença entre um evento
 * recuperado e um evento perdido:
 *   2xx — tratado, duplicado ou definitivamente inválido (reentregar repetiria
 *         o mesmo erro; a falha já está registrada no evento);
 *   5xx — falha reentregável; o QStash reentrega com backoff e, esgotadas as
 *         tentativas, manda para a DLQ.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const jobSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("whatsapp.process-event"), eventId: z.uuid() }),
  z.object({
    kind: z.literal("whatsapp.send-message"),
    attemptId: z.uuid(),
    messageId: z.uuid(),
  }),
]);

const handled = () => Response.json({ ok: true }, { status: 200 });
const retry = (code: string) => Response.json({ ok: false, code }, { status: 503 });

export async function POST(request: Request) {
  const body = await request.text();
  if (!verifyQStashSignature(request.headers.get("upstash-signature"), body)) {
    return new Response(null, { status: 401 });
  }

  let job: z.infer<typeof jobSchema>;
  try {
    const parsed = jobSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return handled();
    job = parsed.data;
  } catch {
    return handled();
  }

  const executor = createTechnicalRpcExecutor();

  if (job.kind === "whatsapp.send-message") {
    const sent = await deliverWhatsAppMessage(
      { attemptId: job.attemptId, messageId: job.messageId },
      executor,
    );
    if (sent.ok) return handled();
    logger.warn("envio whatsapp não concluído", { error_code: sent.code });
    return sent.retryable ? retry(sent.code) : handled();
  }

  const loaded = await loadWhatsAppEvent(job.eventId, executor);
  if (!loaded.ok) {
    // Evento inexistente não volta a existir por reentrega; indisponibilidade,
    // sim — só ela merece um 5xx.
    return loaded.code === "unavailable" ? retry(loaded.code) : handled();
  }

  const envelope = extractEnvelope(loaded.event.raw_payload);
  const kind = envelope?.kind ?? "ignored";

  if (kind === "message") {
    const normalized = toNormalizedMessage(loaded.event.raw_payload, loaded.event.event_id);
    if (!normalized.ok) {
      await markWhatsAppEventIgnored(job.eventId, executor);
      logger.warn("evento whatsapp sem mensagem traduzível", {
        error_code: normalized.code,
        event_id: loaded.event.event_id,
        provider: loaded.event.provider,
      });
      return handled();
    }

    const processed = await processWhatsAppEvent(normalized.value, {
      store: createWhatsAppRpcStore(executor),
    });
    if (processed.ok) return handled();
    logger.warn("processamento de mensagem whatsapp falhou", {
      error_code: processed.code,
      event_id: loaded.event.event_id,
    });
    return "retryable" in processed && processed.retryable ? retry(processed.code) : handled();
  }

  if (kind === "status") {
    const status = toStatusUpdate(loaded.event.raw_payload);
    if (!status.ok) {
      await markWhatsAppEventIgnored(job.eventId, executor);
      return handled();
    }

    const recorded = await recordWhatsAppMessageStatus(
      {
        externalMessageId: status.value.externalMessageId,
        occurredAt: status.value.occurredAt,
        status: status.value.status,
        webhookEventId: loaded.event.event_id,
      },
      executor,
    );
    if (recorded.ok) return handled();

    /*
     * O caso comum de falha aqui é o status chegar antes de a mensagem existir
     * — a RPC procura por `external_message_id` e ainda não encontra nada. É
     * transitório e se resolve na reentrega, então vale o 5xx.
     */
    logger.warn("status de mensagem whatsapp não aplicado", {
      error_code: recorded.code,
      event_id: loaded.event.event_id,
    });
    return retry(recorded.code);
  }

  await markWhatsAppEventIgnored(job.eventId, executor);
  return handled();
}
