import { timingSafeEqual } from "node:crypto";

import { extractEnvelope, ingestWhatsAppEvent, UAZAPI_PROVIDER } from "@/modules/whatsapp";
import { createWhatsAppRpcStore } from "@/modules/whatsapp";
import { serverEnv } from "@/shared/config";
import { createTechnicalRpcExecutor } from "@/shared/db";
import { logger } from "@/shared/observability";
import { resolveQueuePublisher } from "@/shared/queue";

/**
 * Webhook da UAZAPI.
 *
 * Fina de propósito: autentica a origem, persiste o evento cru e enfileira.
 * O processamento é do worker (ADR-008). Manter o webhook curto é o que segura
 * o ACK abaixo do timeout do provedor — e ACK lento vira reentrega, que vira
 * carga extra sem nenhum evento novo.
 */

export const runtime = "nodejs";
/** Cada evento é único; cache aqui só serviria para responder errado. */
export const dynamic = "force-dynamic";

function authenticated(request: Request): boolean {
  const expected = serverEnv.UAZAPI_WEBHOOK_SECRET;
  if (!expected) return false;

  const provided = request.headers.get("x-webhook-secret")
    ?? new URL(request.url).searchParams.get("t")
    ?? "";

  // Comparação em tempo constante: `===` vaza, pelo tempo de resposta, quantos
  // caracteres iniciais o atacante acertou.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authenticated(request)) {
    // Sem tocar no banco e sem dizer o que faltou.
    return new Response(null, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const envelope = extractEnvelope(payload);
  if (!envelope) {
    // Corpo que o adapter não reconhece não é reentregável: 400 encerra.
    logger.warn("webhook uazapi ignorado", {
      error_code: "envelope_unreadable",
      provider: UAZAPI_PROVIDER,
    });
    return Response.json({ ok: false }, { status: 400 });
  }

  const result = await ingestWhatsAppEvent(
    {
      accountExternalId: envelope.accountExternalId,
      eventType: envelope.eventType,
      externalEventId: envelope.externalEventId,
      provider: UAZAPI_PROVIDER,
      rawPayload: payload as Record<string, unknown>,
    },
    {
      queue: await resolveQueuePublisher(),
      store: createWhatsAppRpcStore(createTechnicalRpcExecutor()),
    },
  );

  if (result.ok) {
    return Response.json({ ok: true, duplicate: result.duplicate }, { status: 200 });
  }

  if (result.code === "invalid_input") {
    return Response.json({ ok: false }, { status: 400 });
  }

  /*
   * `not_queued` significa persistido mas não enfileirado. Responder 5xx faz o
   * provedor reentregar, e a reentrega reenfileira — é o caminho de recuperação
   * mais rápido, já descrito em `ingest.ts`. O evento em si não se perdeu.
   */
  logger.error("webhook uazapi não concluído", {
    error_code: result.code,
    provider: UAZAPI_PROVIDER,
    ...("eventId" in result ? { event_id: result.eventId } : {}),
  });
  return Response.json({ ok: false }, { status: 503 });
}
