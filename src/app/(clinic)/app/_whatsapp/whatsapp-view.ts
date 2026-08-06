import type { StatusTone } from "@/shared/ui/status-badge";

/**
 * Vocabulário de apresentação do WhatsApp. Fica fora dos componentes para que
 * card, painel e lista digam exatamente a mesma coisa sobre o mesmo estado.
 */

export const WHATSAPP_SETTINGS_PATH = "/app/settings/whatsapp";

/**
 * Rótulo de prévia para mensagem sem texto. O RPC do quadro devolve o tipo
 * cru; traduzir aqui mantém o pt-BR concentrado na interface, e não no SQL.
 */
const PREVIEW_BY_TYPE: Readonly<Record<string, string>> = {
  audio: "Áudio",
  contact: "Contato",
  document: "Documento",
  image: "Imagem",
  location: "Localização",
  unknown: "Mensagem",
  video: "Vídeo",
};

export function conversationPreview(
  messageType: string | null,
  textContent: string | null,
  direction: string | null,
): string {
  const body = textContent?.trim()
    ? textContent.trim()
    : PREVIEW_BY_TYPE[messageType ?? "unknown"] ?? PREVIEW_BY_TYPE.unknown!;
  // "Você:" só faz sentido quando quem falou por último foi a clínica.
  return direction === "outbound" ? `Você: ${body}` : body;
}

/** Corta a prévia na interface, não no SQL: o dado bruto continua íntegro. */
export function truncatePreview(preview: string, limit = 90): string {
  return preview.length > limit ? `${preview.slice(0, limit - 1)}…` : preview;
}

export const DELIVERY_STATUS_LABELS: Readonly<Record<string, string>> = {
  delivered: "entregue",
  failed: "falhou",
  pending: "enviando…",
  read: "lida",
  sent: "enviada",
};

export const DELIVERY_STATUS_TONES: Readonly<Record<string, StatusTone>> = {
  delivered: "neutral",
  failed: "danger",
  pending: "neutral",
  read: "success",
  sent: "neutral",
};

/**
 * Respostas rápidas fixas (§8 da spec). Lista no código porque nenhuma clínica
 * pediu textos próprios ainda; quando pedir, vira tabela por clínica e este
 * array sai — os componentes não mudam, só a origem da lista.
 */
export const QUICK_REPLIES: readonly string[] = [
  "Sim, parcelamos em até 3x sem juros.",
  "Posso agendar sua avaliação gratuita?",
  "Vou te enviar a tabela de valores.",
];

export const WHATSAPP_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  already_claimed: "Esta instância já está vinculada a outra clínica.",
  clinic_unavailable: "Não foi possível identificar a clínica ativa. Atualize a página.",
  credential_key_unavailable:
    "O servidor está sem a chave de cifragem de credenciais. Fale com o suporte técnico.",
  forbidden: "Você não tem permissão para esta ação.",
  invalid_input: "Revise os dados informados.",
  mfa_required: "Esta alteração exige verificação em duas etapas.",
  not_found: "Registro não encontrado.",
  unavailable: "Serviço indisponível no momento. Tente novamente.",
};

export function whatsappErrorMessage(code: string): string {
  return WHATSAPP_ERROR_MESSAGES[code]
    ?? "Não foi possível concluir a operação. Tente novamente em alguns instantes.";
}
