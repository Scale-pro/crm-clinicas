import "server-only";

/**
 * Fronteira de acesso a dados (ADR-002).
 *
 * Este é o ÚNICO local autorizado a importar o SDK do Supabase/Postgres.
 * Regra verificada por ESLint (`no-restricted-imports`) e dependency-cruiser.
 *
 * Na F0 este módulo é um contrato neutro: nenhum SDK ou serviço real é
 * conectado. A implementação (cliente com sessão do usuário + RLS, e cliente
 * `service role` restrito à lista fechada) chega na F1.
 *
 * O `import "server-only"` acima garante, em tempo de build, que nada deste
 * módulo vaze para o bundle do navegador.
 */

/** Resultado de verificação de saúde da camada de dados (contrato mínimo). */
export interface DbHealthCheck {
  readonly ok: boolean;
  /** Código interno (nunca mensagens com dados sensíveis). */
  readonly code: "not_configured" | "ok" | "error";
}

/**
 * Verificação de saúde neutra. Na F0 sempre reporta `not_configured`,
 * pois nenhum banco é conectado nesta fase.
 */
export function dbHealthCheck(): DbHealthCheck {
  return { ok: false, code: "not_configured" };
}
