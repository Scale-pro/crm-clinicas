import "server-only";

import { z } from "zod";

import { requireAal2, requirePermission } from "@/shared/auth";
import { createServerSupabaseClient } from "@/shared/db";

import { whatsappProviderSchema } from "./contracts";
import { encryptProviderToken } from "./credentials";

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
  /*
   * A RPC exige AAL2 e sinaliza a falta dele com 42501 — o mesmo código de
   * "sem permissão". Conferir aqui antes é o que permite à tela dizer
   * "verifique em duas etapas" em vez de "você não tem acesso", que mandaria o
   * responsável pedir uma permissão que ele já tem.
   */
  const aal2 = await requireAal2();
  if (!aal2.allowed) return { ok: false, code: aal2.code } as const;

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

/**
 * Contas configuradas da clínica. Não devolve credencial: o token vive
 * cifrado em `app_private` e não tem caminho de leitura para o navegador.
 */
export async function listWhatsAppAccounts(clinicId: string) {
  if (!z.uuid().safeParse(clinicId).success) return { ok: false, code: "invalid_input" } as const;

  const permission = await requirePermission(clinicId, "clinic.manage");
  if (!permission.allowed) return { ok: false, code: "forbidden" } as const;

  const supabase = await createServerSupabaseClient();
  const result = await supabase.from("whatsapp_accounts")
    .select("id,provider,external_account_id,display_phone_e164,status,created_at")
    .eq("clinic_id", clinicId)
    .order("created_at");

  if (result.error) return { ok: false, code: "unavailable" } as const;
  return { ok: true, accounts: result.data } as const;
}

export const setWhatsAppAccountSecretSchema = z.object({
  clinicId: z.uuid(),
  token: z.string().trim().min(8).max(4096),
  whatsappAccountId: z.uuid(),
}).strict();

/**
 * Grava o token da instância do provedor cifrado (decisão D1).
 *
 * O texto em claro morre nesta função: o que chega ao banco — e portanto a
 * qualquer dump, log de query ou réplica — é o texto cifrado. A RPC exige a
 * mesma autorização de `create_whatsapp_account` (`clinic.manage` + AAL2),
 * validada de novo no banco.
 */
export async function setWhatsAppAccountSecret(input: unknown) {
  const parsed = setWhatsAppAccountSecretSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;

  const permission = await requirePermission(parsed.data.clinicId, "clinic.manage");
  if (!permission.allowed) return { ok: false, code: "forbidden" } as const;
  const aal2 = await requireAal2();
  if (!aal2.allowed) return { ok: false, code: aal2.code } as const;

  let tokenEncrypted: string;
  try {
    tokenEncrypted = encryptProviderToken(parsed.data.token);
  } catch {
    // A chave de cifragem é configuração de servidor: sem ela não existe forma
    // segura de guardar o token, e gravar em claro não é alternativa.
    return { ok: false, code: "credential_key_unavailable" } as const;
  }

  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("set_whatsapp_account_secret", {
    p_clinic_id: parsed.data.clinicId,
    p_token_encrypted: tokenEncrypted,
    p_whatsapp_account_id: parsed.data.whatsappAccountId,
  });

  if (result.error) {
    const code = (result.error as { code?: string }).code;
    if (code === "42501") return { ok: false, code: "forbidden" } as const;
    if (code === "22023") return { ok: false, code: "invalid_input" } as const;
    if (code === "P0002") return { ok: false, code: "not_found" } as const;
    return { ok: false, code: "unavailable" } as const;
  }

  return { ok: true } as const;
}
