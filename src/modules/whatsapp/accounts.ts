import "server-only";

import { z } from "zod";

import { requirePermission } from "@/shared/auth";
import { createServerSupabaseClient } from "@/shared/db";

import { whatsappProviderSchema } from "./contracts";

export const createWhatsAppAccountSchema = z.object({
  clinicId: z.uuid(),
  displayPhone: z.string().trim().min(8).max(32).nullable().default(null),
  externalAccountId: z.string().trim().min(1).max(200),
  provider: whatsappProviderSchema,
}).strict();

/**
 * Provisiona a conta do provedor que a ingestão usa para resolver o tenant.
 * O `clinicId` recebido é só navegação: quem autoriza é `requirePermission` no
 * servidor e, de novo, a própria RPC.
 */
export async function createWhatsAppAccount(input: unknown) {
  const parsed = createWhatsAppAccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;

  const permission = await requirePermission(parsed.data.clinicId, "clinic.manage");
  if (!permission.allowed) return { ok: false, code: "forbidden" } as const;

  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("create_whatsapp_account", {
    clinic_id: parsed.data.clinicId,
    display_phone: parsed.data.displayPhone,
    external_account_id: parsed.data.externalAccountId,
    provider: parsed.data.provider,
  });

  if (result.error) {
    const code = (result.error as { code?: string }).code;
    if (code === "42501") return { ok: false, code: "forbidden" } as const;
    if (code === "22023") return { ok: false, code: "invalid_input" } as const;
    if (code === "P4304") return { ok: false, code: "already_claimed" } as const;
    return { ok: false, code: "unavailable" } as const;
  }

  return { ok: true, accountId: result.data } as const;
}
