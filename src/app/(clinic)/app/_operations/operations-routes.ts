import type { StatusFilter } from "./operations-view-models";

/**
 * Leitura e reescrita da query string das telas de operações.
 *
 * Busca, filtros e página vivem na URL: a listagem é resolvida no servidor, e
 * um link compartilhado reproduz exatamente a mesma tela. Só as chaves
 * conhecidas atravessam a reescrita — nada vindo da URL é repassado adiante sem
 * ser reconhecido aqui.
 */

export type RouteParams = Record<string, string | string[] | undefined>;

export const PROFESSIONALS_PATH = "/app/settings/professionals";
export const PROCEDURES_PATH = "/app/settings/procedures";

export const PROFESSIONAL_QUERY_KEYS = ["q", "statusFilter", "specialty"] as const;
export const PROCEDURE_QUERY_KEYS = ["q", "statusFilter"] as const;

export const OPERATIONS_PAGE_SIZE = 25;
/** Teto do contrato de listagem — usado nas consultas de opções de filtro. */
export const OPERATIONS_MAX_PAGE_SIZE = 100;

export function stringParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export function pageParam(value: string | string[] | undefined): number {
  const parsed = Number(stringParam(value));
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1_000_000 ? parsed : 1;
}

/** Só `active`/`inactive` filtram; qualquer outro valor significa "todas". */
export function statusFilterParam(value: string | string[] | undefined): StatusFilter {
  const raw = stringParam(value);
  return raw === "active" || raw === "inactive" ? raw : "all";
}

export function statusFilterToQuery(status: StatusFilter): "active" | "inactive" | null {
  return status === "all" ? null : status;
}

export function operationsHref(
  basePath: string,
  keys: readonly string[],
  params: RouteParams,
  overrides: Readonly<Record<string, string>> = {},
): string {
  const query = new URLSearchParams();
  for (const key of keys) {
    const value = stringParam(params[key]);
    if (value) query.set(key, value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value) query.set(key, value); else query.delete(key);
  }
  const serialized = query.toString();
  return serialized ? `${basePath}?${serialized}` : basePath;
}
