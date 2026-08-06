/**
 * Tradução dos códigos de erro de `@/modules/scheduling` para mensagens de
 * interface.
 *
 * Regra desta fronteira: **nada** que venha do banco chega ao navegador.
 * Mensagem do Postgres, SQLSTATE, nome de RPC, nome de constraint e detalhe de
 * exceção ficam do lado do servidor. Aqui só existe texto escrito por pessoas,
 * em pt-BR, dizendo o que aconteceu e o que fazer a seguir.
 *
 * Código desconhecido cai na mensagem genérica — nunca é ecoado.
 */

const FALLBACK_MESSAGE = "Não foi possível concluir a operação. Tente novamente em alguns instantes.";

const MESSAGES: Readonly<Record<string, string>> = {
  appointment_canceled: "Este agendamento foi cancelado. Crie um novo para reagendar.",
  appointment_contact_not_found: "Este cliente não está mais disponível. Atualize a página.",
  appointment_not_found: "Este agendamento não existe mais. Atualize a página.",
  appointment_overlap: "Este profissional já tem outro atendimento neste horário. Escolha outro horário.",
  availability_overlap: "Há horários sobrepostos na semana. Revise os intervalos e salve novamente.",
  clinic_unavailable: "Não foi possível identificar a clínica ativa. Atualize a página e tente novamente.",
  contact_duplicate: "Já existe um cliente com estes dados. Selecione-o na busca em vez de criar outro.",
  forbidden: "Você não tem permissão para esta ação nesta clínica.",
  invalid_availability: "Os horários informados não são válidos. Revise início e fim de cada intervalo.",
  invalid_input: "Revise os campos: algum valor não é aceito.",
  mfa_required: "Esta alteração exige verificação em duas etapas. Verifique sua identidade e tente novamente.",
  procedure_archived: "Este procedimento está arquivado e não pode mais ser alterado.",
  procedure_name_conflict: "Já existe um procedimento com este nome nesta clínica.",
  procedure_not_found: "Este procedimento não está mais disponível. Atualize a página.",
  professional_archived: "Este profissional está arquivado e não pode mais ser alterado.",
  professional_not_found: "Este profissional não está mais disponível. Atualize a página.",
  professional_procedure_conflict: "A habilitação deste profissional mudou enquanto você editava. Atualize a página e tente de novo.",
  // Limitação conhecida do contrato de scheduling: uma habilitação removida
  // deixa de aparecer nas leituras públicas, e reativá-la exigiria a versão do
  // registro arquivado — que nenhuma leitura devolve. Dizemos isso em vez de
  // pedir uma atualização de página que não resolveria nada.
  professional_procedure_relink_unavailable: "Este profissional já teve a habilitação removida deste procedimento e ainda não é possível reabilitá-lo por aqui. As demais alterações foram salvas.",
  professional_user_already_linked: "Este usuário da equipe já está vinculado a outro profissional.",
  professional_user_not_member: "Este usuário não faz parte da equipe ativa da clínica.",
  stale_version: "Este cadastro foi alterado por outra pessoa enquanto você editava. Atualize a página e refaça a alteração.",
  unauthenticated: "Sua sessão expirou. Entre novamente para continuar.",
  unavailable: FALLBACK_MESSAGE,
};

export function schedulingErrorMessage(code: string): string {
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
