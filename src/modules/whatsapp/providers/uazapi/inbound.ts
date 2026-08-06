/**
 * Tradução do payload da UAZAPI para o evento normalizado do domínio.
 *
 * Funções puras, sem I/O: tudo aqui é testável por fixture. Este é o único
 * arquivo que conhece o formato da UAZAPI no caminho de entrada — o domínio
 * recebe apenas `NormalizedWhatsAppMessage`.
 *
 * Sobre as chaves candidatas: a UAZAPI mudou nomes entre versões (`EventType`
 * virou `event`, `messageid` convive com `id`) e o payload carrega o objeto do
 * Baileys por baixo. Em vez de espalhar `??` pelo código, cada campo declara a
 * lista de caminhos onde ele pode estar, na ordem de preferência. Trocar de
 * versão — ou de provedor — é editar uma lista, não caçar acessos.
 *
 * Nada de mídia binária: guardamos metadados e a referência (`mediaId`).
 * Baixar/rehospedar arquivo está fora do MVP (decisão D3).
 */

import {
  normalizedWhatsAppMessageSchema,
  whatsappDeliveryStatusSchema,
  type NormalizedWhatsAppMessage,
} from "../../contracts";

export const UAZAPI_PROVIDER = "uazapi";

export type UazapiEventKind = "message" | "status" | "ignored";

export type UazapiEnvelope = {
  readonly accountExternalId: string;
  readonly eventType: string;
  readonly externalEventId: string;
  readonly kind: UazapiEventKind;
};

export type UazapiStatusUpdate = {
  readonly externalMessageId: string;
  readonly occurredAt: string;
  readonly status: "pending" | "sent" | "delivered" | "read" | "failed";
};

type Path = readonly string[];

function read(raw: unknown, path: Path): unknown {
  let cursor = raw;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

function firstString(raw: unknown, paths: readonly Path[]): string | null {
  for (const path of paths) {
    const value = read(raw, path);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstNumber(raw: unknown, paths: readonly Path[]): number | null {
  for (const path of paths) {
    const value = read(raw, path);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function firstBoolean(raw: unknown, paths: readonly Path[]): boolean | null {
  for (const path of paths) {
    const value = read(raw, path);
    if (typeof value === "boolean") return value;
  }
  return null;
}

const EVENT_TYPE_PATHS: readonly Path[] = [["EventType"], ["event"], ["type"]];
const ACCOUNT_PATHS: readonly Path[] = [
  ["instance_id"], ["instanceId"], ["instance"], ["owner"],
  ["message", "owner"], ["instance", "id"], ["instance", "name"],
];
const MESSAGE_ID_PATHS: readonly Path[] = [
  ["message", "messageid"], ["message", "id"], ["message", "key", "id"],
  ["messageid"], ["key", "id"], ["id"],
];
const CHAT_PATHS: readonly Path[] = [
  ["message", "chatid"], ["message", "sender"], ["message", "key", "remoteJid"],
  ["chatid"], ["sender"], ["key", "remoteJid"],
];
const FROM_ME_PATHS: readonly Path[] = [
  ["message", "fromMe"], ["message", "key", "fromMe"], ["fromMe"], ["key", "fromMe"],
];
const TIMESTAMP_PATHS: readonly Path[] = [
  ["message", "messageTimestamp"], ["message", "timestamp"],
  ["messageTimestamp"], ["timestamp"],
];
const SENDER_NAME_PATHS: readonly Path[] = [
  ["message", "senderName"], ["message", "pushName"], ["message", "chatName"],
  ["senderName"], ["pushName"],
];
const TEXT_PATHS: readonly Path[] = [
  ["message", "text"], ["message", "content", "text"],
  ["message", "message", "conversation"],
  ["message", "message", "extendedTextMessage", "text"],
  ["message", "caption"], ["text"],
];
const PROVIDER_TYPE_PATHS: readonly Path[] = [
  ["message", "messageType"], ["message", "type"], ["message", "mediaType"], ["messageType"],
];
const STATUS_PATHS: readonly Path[] = [
  ["message", "status"], ["status"], ["update", "status"], ["ack"], ["message", "ack"],
];

/**
 * `messages` cobre recebimento e espelho de envio; `messages_update` traz o
 * avanço de entrega/leitura. Qualquer outro evento (presença, conexão, chats,
 * grupos) é ruído para o CRM.
 */
const MESSAGE_EVENTS = new Set(["messages", "message", "messages.upsert", "messages_upsert"]);
const STATUS_EVENTS = new Set([
  "messages_update", "message_update", "messages.update", "message_ack", "messages_ack",
]);

/** Tipos do Baileys que a UAZAPI repassa, mapeados para o enum do domínio. */
const MESSAGE_TYPE_BY_PROVIDER_TYPE: Readonly<Record<string, NormalizedWhatsAppMessage["messageType"]>> = {
  audiomessage: "audio",
  contactmessage: "contact",
  contactsarraymessage: "contact",
  conversation: "text",
  documentmessage: "document",
  documentwithcaptionmessage: "document",
  extendedtextmessage: "text",
  imagemessage: "image",
  livelocationmessage: "location",
  locationmessage: "location",
  pttmessage: "audio",
  videomessage: "video",
  // Nomes curtos que a UAZAPI usa em `mediaType`.
  audio: "audio",
  contact: "contact",
  document: "document",
  image: "image",
  location: "location",
  text: "text",
  video: "video",
};

/** Ack numérico e textual do WhatsApp, na ordem em que a entrega progride. */
const STATUS_BY_PROVIDER_STATUS: Readonly<Record<string, UazapiStatusUpdate["status"]>> = {
  "0": "failed",
  "1": "sent",
  "2": "sent",
  "3": "delivered",
  "4": "read",
  "5": "read",
  delivery_ack: "delivered",
  deleted: "failed",
  error: "failed",
  failed: "failed",
  パ: "failed",
  pending: "pending",
  played: "read",
  read: "read",
  sent: "sent",
  server_ack: "sent",
};

function classify(eventType: string): UazapiEventKind {
  const key = eventType.trim().toLowerCase();
  if (MESSAGE_EVENTS.has(key)) return "message";
  if (STATUS_EVENTS.has(key)) return "status";
  return "ignored";
}

/**
 * Só o número: `5511999999999@s.whatsapp.net` vira `5511999999999`. A
 * normalização para E.164 é do domínio (`prepareWhatsAppLeadCandidate`), não
 * daqui — o adapter não decide regra de negócio.
 */
function extractPhone(jid: string | null): string | null {
  if (!jid) return null;
  // Grupo não é lead: tem vários participantes e nenhum telefone único.
  if (jid.includes("@g.us") || jid.includes("@broadcast")) return null;
  const digits = jid.split("@")[0]?.split(":")[0]?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** A UAZAPI manda segundos; alguns eventos vêm em milissegundos. */
function toIsoTimestamp(value: number | null): string | null {
  if (value === null || value <= 0) return null;
  const millis = value > 1e12 ? value : value * 1000;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function extractEnvelope(raw: unknown): UazapiEnvelope | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const eventType = firstString(raw, EVENT_TYPE_PATHS);
  const accountExternalId = firstString(raw, ACCOUNT_PATHS);
  if (!eventType || !accountExternalId) return null;

  const kind = classify(eventType);
  const messageId = firstString(raw, MESSAGE_ID_PATHS);

  /*
   * O id do evento é composto de propósito. `whatsapp_webhook_events` é único
   * por (conta, external_event_id), e a UAZAPI reusa o id da mensagem no
   * callback de status: sem o prefixo, o `delivered` de uma mensagem seria
   * tratado como reentrega do próprio evento de recebimento e descartado — a
   * mensagem nunca sairia de "enviada". O status entra na chave pelo mesmo
   * motivo, para que `delivered` e `read` não colidam entre si.
   */
  if (kind === "message") {
    if (!messageId) return null;
    return { accountExternalId, eventType, externalEventId: `msg:${messageId}`, kind };
  }

  if (kind === "status") {
    const status = firstString(raw, STATUS_PATHS);
    if (!messageId || !status) return null;
    return {
      accountExternalId,
      eventType,
      externalEventId: `status:${messageId}:${status.toLowerCase()}`,
      kind,
    };
  }

  // Evento irrelevante ainda precisa de chave estável: sem ela, cada reentrega
  // do provedor criaria uma linha nova em vez de deduplicar.
  const fallbackId = messageId ?? firstString(raw, [["id"], ["timestamp"]]) ?? eventType;
  return {
    accountExternalId,
    eventType,
    externalEventId: `ignored:${eventType}:${fallbackId}`,
    kind: "ignored",
  };
}

function buildAttachmentMetadata(raw: unknown): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  const caption = firstString(raw, [["message", "caption"], ["message", "content", "caption"]]);
  if (caption) metadata.caption = caption.slice(0, 2000);

  const fileName = firstString(raw, [
    ["message", "fileName"], ["message", "filename"], ["message", "content", "fileName"],
  ]);
  if (fileName) metadata.fileName = fileName.slice(0, 255);

  const mimeType = firstString(raw, [
    ["message", "mimetype"], ["message", "mimeType"], ["message", "content", "mimetype"],
  ]);
  if (mimeType) metadata.mimeType = mimeType.slice(0, 160);

  // Referência, não conteúdo: nenhuma URL assinada entra no banco (ADR-012).
  const mediaId = firstString(raw, [
    ["message", "mediaId"], ["message", "directPath"], ["message", "content", "directPath"],
  ]);
  if (mediaId) metadata.mediaId = mediaId.slice(0, 240);

  // O Baileys manda sha256 em base64; o domínio só aceita hex de 64 caracteres.
  const sha256 = firstString(raw, [["message", "fileSha256"], ["message", "sha256"]]);
  if (sha256 && /^[a-fA-F0-9]{64}$/.test(sha256)) metadata.sha256 = sha256;

  const sizeBytes = firstNumber(raw, [["message", "fileLength"], ["message", "size"]]);
  if (sizeBytes !== null && sizeBytes >= 0) metadata.sizeBytes = Math.trunc(sizeBytes);

  const latitude = firstNumber(raw, [
    ["message", "latitude"], ["message", "content", "degreesLatitude"],
  ]);
  const longitude = firstNumber(raw, [
    ["message", "longitude"], ["message", "content", "degreesLongitude"],
  ]);
  if (latitude !== null && longitude !== null
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
    metadata.latitude = latitude;
    metadata.longitude = longitude;
  }

  return metadata;
}

export type UazapiTranslation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: "invalid_payload" };

export function toNormalizedMessage(
  raw: unknown,
  eventId: string,
): UazapiTranslation<NormalizedWhatsAppMessage> {
  const externalMessageId = firstString(raw, MESSAGE_ID_PATHS);
  const phone = extractPhone(firstString(raw, CHAT_PATHS));
  const occurredAt = toIsoTimestamp(firstNumber(raw, TIMESTAMP_PATHS));
  if (!externalMessageId || !phone || !occurredAt) {
    return { ok: false, code: "invalid_payload" };
  }

  const providerPayloadType = firstString(raw, PROVIDER_TYPE_PATHS);
  const contactName = firstString(raw, SENDER_NAME_PATHS);
  const textContent = firstString(raw, TEXT_PATHS);

  const parsed = normalizedWhatsAppMessageSchema.safeParse({
    attachmentMetadata: buildAttachmentMetadata(raw),
    // Nome curto demais para o domínio vira ausência, para que o default
    // ("Contato do WhatsApp") valha em vez de a mensagem inteira ser recusada.
    ...(contactName && contactName.length >= 2 ? { contactName: contactName.slice(0, 160) } : {}),
    direction: firstBoolean(raw, FROM_ME_PATHS) ? "outbound" : "inbound",
    eventId,
    externalMessageId: externalMessageId.slice(0, 240),
    messageType: providerPayloadType
      ? MESSAGE_TYPE_BY_PROVIDER_TYPE[providerPayloadType.toLowerCase()] ?? "unknown"
      : "unknown",
    occurredAt,
    phone,
    providerPayloadType: providerPayloadType?.slice(0, 120) ?? null,
    textContent: textContent ? textContent.slice(0, 65535) : null,
  });

  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, code: "invalid_payload" };
}

export function toStatusUpdate(raw: unknown): UazapiTranslation<UazapiStatusUpdate> {
  const externalMessageId = firstString(raw, MESSAGE_ID_PATHS);
  const providerStatus = firstString(raw, STATUS_PATHS);
  if (!externalMessageId || !providerStatus) return { ok: false, code: "invalid_payload" };

  const status = STATUS_BY_PROVIDER_STATUS[providerStatus.trim().toLowerCase()];
  const parsedStatus = whatsappDeliveryStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { ok: false, code: "invalid_payload" };

  return {
    ok: true,
    value: {
      externalMessageId: externalMessageId.slice(0, 240),
      // Callback de status raramente traz horário próprio; o instante em que o
      // CRM observou o avanço é o dado honesto, e o ranking monotônico das RPCs
      // já impede que um callback atrasado rebaixe um status posterior.
      occurredAt: toIsoTimestamp(firstNumber(raw, TIMESTAMP_PATHS)) ?? new Date().toISOString(),
      status: parsedStatus.data,
    },
  };
}
