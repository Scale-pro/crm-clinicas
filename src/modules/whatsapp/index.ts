import "server-only";

export {
  ingestWhatsAppEventSchema,
  normalizedWhatsAppMessageSchema,
  safeAttachmentMetadataSchema,
  sanitizeWhatsAppPayload,
  whatsappDeliveryStatusSchema,
  whatsappMessageTypeSchema,
  whatsappProviderSchema,
} from "./contracts";
export type { NormalizedWhatsAppMessage } from "./contracts";
export {
  assignConversation,
  assignConversationSchema,
  closeConversation,
  countUnreadConversations,
  createOutboundMessage,
  createOutboundMessageSchema,
  getConversation,
  listConversationMessages,
  listConversationMessagesSchema,
  listConversations,
  listConversationsSchema,
  markConversationRead,
  reopenConversation,
  resolveConversationScope,
} from "./conversations";
export {
  createWhatsAppAccount,
  createWhatsAppAccountSchema,
  listWhatsAppAccounts,
  setWhatsAppAccountSecret,
  setWhatsAppAccountSecretSchema,
} from "./accounts";
export {
  deliverWhatsAppMessage,
  loadWhatsAppEvent,
  markWhatsAppEventIgnored,
} from "./delivery";
export type { WhatsAppEventRow } from "./delivery";
/**
 * Adapter da UAZAPI. Fica atrás da interface pública do módulo porque quem o
 * consome são as rotas de webhook e do worker — e `src/app` só pode importar
 * `@/modules/<nome>`. O domínio continua falando apenas o vocabulário
 * normalizado: nenhum caso de uso de CRM toca estas funções.
 */
export {
  extractEnvelope,
  toNormalizedMessage,
  toStatusUpdate,
  UAZAPI_PROVIDER,
} from "./providers/uazapi/inbound";
export type { UazapiEnvelope, UazapiEventKind, UazapiStatusUpdate } from "./providers/uazapi/inbound";
export {
  ingestWhatsAppEvent,
  processWhatsAppEvent,
  reprocessWhatsAppEvent,
} from "./ingest";
export type {
  PersistedWhatsAppEvent,
  ProcessedWhatsAppMessage,
  WhatsAppEventStore,
} from "./ingest";
export {
  createWhatsAppRpcStore,
  recordWhatsAppMessageStatus,
} from "./rpc-store";
export type { WhatsAppRpcExecutor } from "./rpc-store";
