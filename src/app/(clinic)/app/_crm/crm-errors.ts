/**
 * Tradução dos códigos de `@/modules/crm` para mensagens de interface.
 *
 * Regra da fronteira: nada vindo do banco chega ao navegador. Mensagem do
 * Postgres, SQLSTATE, nome de RPC, nome de constraint e detalhe de exceção
 * ficam do lado do servidor. Aqui só existe texto escrito por pessoas, em
 * pt-BR, dizendo o que aconteceu e o que fazer a seguir.
 *
 * Código desconhecido cai na mensagem genérica — nunca é ecoado.
 */

const FALLBACK_MESSAGE = "Não foi possível concluir a operação. Tente novamente em alguns instantes.";

const MESSAGES: Readonly<Record<string, string>> = {
  conflict: "Este registro foi alterado por outra pessoa enquanto você editava. Atualize a página e refaça a alteração.",
  default_pipeline: "Este é o pipeline padrão da clínica e não pode ser removido.",
  duplicate: "Já existe um contato com este telefone ou e-mail nesta clínica.",
  existing_open: "Este contato já tem uma oportunidade aberta. Confirme para criar outra.",
  forbidden: "Você não tem permissão para esta ação nesta clínica.",
  invalid_input: "Revise os campos: algum valor não é aceito.",
  last_active_pipeline: "Esta é a última pipeline ativa e não pode ser arquivada.",
  mfa_required: "Esta ação exige verificação em duas etapas. Verifique sua identidade e tente novamente.",
  not_found: "Este registro não está mais disponível. Atualize a página.",
  pipeline_archived: "Esta pipeline está arquivada e não aceita mais alterações.",
  pipeline_has_open_opportunities: "Ainda há oportunidades abertas nesta pipeline.",
  unauthenticated: "Sua sessão expirou. Entre novamente para continuar.",
  unavailable: FALLBACK_MESSAGE,
};

export function crmErrorMessage(code: string): string {
  return MESSAGES[code] ?? FALLBACK_MESSAGE;
}

/** `true` quando a única coisa que falta é a verificação em duas etapas. */
export function requiresMfa(code: string): boolean {
  return code === "mfa_required";
}

/** Destino da verificação em duas etapas, preservando a tela de origem. */
export function mfaHref(returnPath: string): string {
  return `/mfa?next=${encodeURIComponent(returnPath)}`;
}
