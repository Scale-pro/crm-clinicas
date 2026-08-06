import { z } from "zod";

export const whatsappProviderSchema = z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/);
export const whatsappMessageTypeSchema = z.enum([
  "text", "audio", "image", "video", "document", "location", "contact", "unknown",
]);
export const whatsappDeliveryStatusSchema = z.enum([
  "pending", "sent", "delivered", "read", "failed",
]);

export const safeAttachmentMetadataSchema = z.object({
  caption: z.string().max(2000).optional(),
  fileName: z.string().max(255).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  mediaId: z.string().max(240).optional(),
  mimeType: z.string().max(160).optional(),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  sizeBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();

export const normalizedWhatsAppMessageSchema = z.object({
  contactName: z.string().trim().min(2).max(160).default("Contato do WhatsApp"),
  direction: z.enum(["inbound", "outbound"]),
  eventId: z.uuid(),
  externalMessageId: z.string().min(1).max(240),
  messageType: whatsappMessageTypeSchema,
  occurredAt: z.iso.datetime({ offset: true }),
  phone: z.string().min(8).max(32),
  providerPayloadType: z.string().max(120).nullable().default(null),
  textContent: z.string().max(65535).nullable().default(null),
  attachmentMetadata: safeAttachmentMetadataSchema.default({}),
}).strict();

export type NormalizedWhatsAppMessage = z.infer<typeof normalizedWhatsAppMessageSchema>;

export const ingestWhatsAppEventSchema = z.object({
  accountExternalId: z.string().min(1).max(200),
  eventType: z.string().min(1).max(120),
  externalEventId: z.string().min(1).max(240),
  provider: whatsappProviderSchema,
  rawPayload: z.record(z.string(), z.unknown()),
}).strict();

const SECRET_KEY = /authorization|cookie|credential|password|secret|signature|token/i;

/** Remove credenciais acidentais sem registrar ou expor o payload recebido. */
export function sanitizeWhatsAppPayload(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, 1000).map((item) => sanitizeWhatsAppPayload(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SECRET_KEY.test(key))
        .map(([key, child]) => [key, sanitizeWhatsAppPayload(child, depth + 1)]),
    );
  }
  return typeof value === "string" && value.length > 65535
    ? `${value.slice(0, 65535)}[truncated]`
    : value;
}
