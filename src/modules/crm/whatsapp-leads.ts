import "server-only";

import { z } from "zod";

import { normalizeE164Phone } from "@/shared/lib/contact-method";

export const whatsappLeadCandidateSchema = z.object({
  contactName: z.string().trim().min(2).max(160),
  eventId: z.uuid(),
  phone: z.string().min(8).max(32),
}).strict();

/**
 * Fronteira pública do CRM usada por entradas automáticas. Ela concentra a
 * representação canônica de pessoa/idempotência sem expor internals do módulo.
 */
export function prepareWhatsAppLeadCandidate(input: unknown) {
  const parsed = whatsappLeadCandidateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const phoneE164 = normalizeE164Phone(parsed.data.phone);
  if (!phoneE164) return { ok: false, code: "invalid_phone" } as const;
  return {
    ok: true,
    candidate: {
      contactName: parsed.data.contactName,
      idempotencyKey: parsed.data.eventId,
      phoneE164,
    },
  } as const;
}
