import "server-only";

/**
 * Contrato da fila (ADR-009), separado da composição para que as
 * implementações possam depender dele sem depender do barrel — o que fecharia
 * um ciclo `index → qstash → index`.
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

/** Contrato do publicador de jobs. */
export interface QueuePublisher {
  publish(job: QueueJob): Promise<QueueEnqueueResult>;
}

/**
 * Publicador neutro: não conecta serviço algum e sinaliza `not_configured`.
 * Existe para que consumidores dependam do contrato, nunca de um SDK.
 */
export function createNoopQueuePublisher(): QueuePublisher {
  return {
    publish: async () => ({ enqueued: false, code: "not_configured" }),
  };
}
