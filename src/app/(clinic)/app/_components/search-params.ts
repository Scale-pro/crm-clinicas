export type RouteParams = Record<string, string | string[] | undefined>;

/** Parâmetros de consulta preservados entre navegações das telas de leads. */
export const OPPORTUNITY_QUERY_KEYS = [
  "q",
  "assignee",
  "source",
  "statusFilter",
  "pageSize",
  // Filtro "só não lidas" do quadro: precisa sobreviver à paginação e à volta
  // de um formulário, senão o quadro reaparece sem o recorte que o usuário
  // escolheu.
  "unread",
] as const;

export function stringParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export function positiveIntParam(
  value: string | string[] | undefined,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number(stringParam(value));
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback;
}

/** Reescreve a query string preservando somente as chaves conhecidas. */
export function opportunityHref(
  basePath: string,
  params: RouteParams,
  overrides: Readonly<Record<string, string>> = {},
): string {
  const query = new URLSearchParams();
  for (const key of OPPORTUNITY_QUERY_KEYS) {
    const value = stringParam(params[key]);
    if (value) query.set(key, value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value) query.set(key, value); else query.delete(key);
  }
  const serialized = query.toString();
  return serialized ? `${basePath}?${serialized}` : basePath;
}
