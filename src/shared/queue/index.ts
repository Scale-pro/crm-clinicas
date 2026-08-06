import "server-only";

/**
 * Fronteira de fila assíncrona (ADR-009).
 *
 * Este é o ÚNICO local autorizado a importar o SDK da fila (QStash/Upstash).
 * Regra verificada por ESLint (`no-restricted-imports`) e dependency-cruiser.
 *
 * O contrato vive em `contract.ts` e a implementação QStash em `qstash.ts`.
 * Este arquivo é só a fachada e o ponto de composição: quem consome a fila
 * depende da interface, nunca de um provedor.
 */

import { createNoopQueuePublisher, type QueuePublisher } from "./contract";

export { createNoopQueuePublisher } from "./contract";
export type { QueueEnqueueResult, QueueJob, QueuePublisher } from "./contract";
export { verifyQStashSignature } from "./qstash";

/**
 * Ponto único de composição da fila. Ambiente com QStash configurado usa
 * QStash; sem configuração, o publicador neutro — e quem chama trata
 * `not_configured` como já trata hoje. É por isto que não existe `if` de
 * ambiente espalhado pelo domínio.
 */
export async function resolveQueuePublisher(): Promise<QueuePublisher> {
  const { serverEnv } = await import("@/shared/config");
  if (!serverEnv.QSTASH_TOKEN) return createNoopQueuePublisher();
  const { createQStashQueuePublisher } = await import("./qstash");
  return createQStashQueuePublisher();
}
