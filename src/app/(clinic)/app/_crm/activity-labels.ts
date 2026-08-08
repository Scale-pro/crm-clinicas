/**
 * Rótulos das atividades registradas pelo domínio.
 *
 * O tipo guardado é vocabulário interno (`contact.created`). Ele é traduzido
 * aqui para uma frase legível — um tipo desconhecido cai em um texto genérico
 * em vez de vazar o identificador cru para a tela.
 */

const ACTIVITY_LABELS: Readonly<Record<string, string>> = {
  "contact.archived": "Contato arquivado",
  "contact.created": "Contato cadastrado",
  "contact.owner_changed": "Responsável alterado",
  "contact.patient_linked": "Vinculado como paciente",
  "contact.patient_unlinked": "Desvinculado de paciente",
  "contact.updated": "Contato atualizado",
  "contact_method.archived": "Meio de contato removido",
  "contact_method.created": "Meio de contato adicionado",
  "contact_method.primary_changed": "Meio de contato principal alterado",
  "contact_method.updated": "Meio de contato atualizado",
  "opportunity.assigned": "Responsável da oportunidade alterado",
  "opportunity.created": "Oportunidade criada",
  "opportunity.lost": "Oportunidade marcada como perdida",
  "opportunity.reopened": "Oportunidade reaberta",
  "opportunity.stage_changed": "Oportunidade mudou de etapa",
  "opportunity.updated": "Oportunidade atualizada",
  "opportunity.won": "Oportunidade marcada como ganha",
};

export function activityLabel(type: string): string {
  return ACTIVITY_LABELS[type] ?? "Atividade registrada";
}
