import "server-only";

/**
 * Fronteira de autenticação e autorização (ADR-002, ADR-004).
 *
 * Local único dos guards de servidor (sessão + tenant + permissão), consumidos
 * por Server Actions e Route Handlers. `PermissionGate` (UI) é apenas UX e
 * nunca substitui estes guards (ADR-011).
 *
 * Na F0 apenas o contrato existe: autenticação funcional, Supabase Auth,
 * memberships e RLS chegam na F1. Nenhuma sessão real é criada aqui.
 */

/** Resultado de um guard de servidor (contrato mínimo, sem dados pessoais). */
export type GuardResult =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      /** Código interno do motivo (nunca detalhes sensíveis). */
      readonly code: "not_configured" | "unauthenticated" | "forbidden";
    };

/**
 * Guard neutro da F0: sempre nega com `not_configured`, deixando explícito
 * que nenhum fluxo autenticado existe antes da F1.
 */
export function requireSession(): GuardResult {
  return { allowed: false, code: "not_configured" };
}
