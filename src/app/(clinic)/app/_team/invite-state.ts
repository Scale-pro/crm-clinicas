/**
 * Estado do convite, compartilhado entre a Server Action e o painel.
 *
 * Vive fora de `actions.ts` porque um módulo `"use server"` só pode exportar
 * funções assíncronas — constantes e tipos precisam de casa própria.
 *
 * `created` é o único estado que carrega o link de aceite, e ele existe apenas
 * na resposta da submissão que criou o convite: o token nunca vai para
 * redirecionamento, query string ou log.
 */

/** Validade do convite, em horas. A tela informa o mesmo número. */
export const INVITE_EXPIRES_IN_HOURS = 72;

export type InviteState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string }
  | {
    readonly status: "created";
    readonly link: string;
    readonly email: string;
    readonly expiresInHours: number;
  };

export const INVITE_IDLE: InviteState = { status: "idle" };
