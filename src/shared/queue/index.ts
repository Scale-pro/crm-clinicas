import "server-only";

/**
 * Fronteira de fila assíncrona (ADR-009).
 *
 * Este é o ÚNICO local autorizado a importar o SDK da fila (QStash/Upstash).
 * Regra verificada por ESLint (`no-restricted-imports`) e dependency-cruiser.
 *
 * Na F0 apenas o contrato existe: nenhum SDK ou serviço real é conectado.
 * A implementação QStash (com retry/backoff/DLQ) chega na F3, atrás desta
 * interface, para que a fila seja substituível sem alterar o domínio.
 */

/** Trabalho a ser enfileirado. `dedupeKey` sustenta a idempotência (ADR-008). */
export interface QueueJob {
  readonly kind: string;
  readonly payload: unknown;
  readonly dedupeKey?: string;
}

export interface QueueEnqueueResult {
  readonly enqueued: boolean;
  /** Código interno (nunca conteúdo do payload). */
  readonly code: "not_configured" | "ok" | "error";
}

/** Contrato do publicador de jobs. Implementações reais chegam na F3. */
export interface QueuePublisher {
  publish(job: QueueJob): Promise<QueueEnqueueResult>;
}

/**
 * Publicador neutro da F0: não conecta serviço algum e sinaliza
 * `not_configured`. Existe para que consumidores futuros dependam do contrato,
 * nunca de um SDK.
 */
export function createNoopQueuePublisher(): QueuePublisher {
  return {
    publish: async () => ({ enqueued: false, code: "not_configured" }),
  };
}
