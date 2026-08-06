import "server-only";

import { z } from "zod";

import { serverEnv } from "@/shared/config";

import { decryptProviderToken } from "./credentials";
import { UAZAPI_PROVIDER } from "./providers/uazapi/inbound";
import { sendUazapiTextMessage } from "./providers/uazapi/outbound";
import type { WhatsAppRpcExecutor } from "./rpc-store";

/**
 * Entrega de mensagens de saída (decisão D2: enfileirada).
 *
 * O clique "Enviar" já gravou a intenção com `create_whatsapp_outbound_message`
 * — mensagem `pending`, tentativa 1 aberta. Aqui o worker resolve a credencial,
 * chama o provedor e fecha a tentativa com `record_whatsapp_send_result`. Se
 * este passo nunca rodar, nada se perde: a mensagem continua visível como
 * pendente e a tentativa continua aberta.
 */

const eventRowSchema = z.object({
  clinic_id: z.uuid(),
  event_id: z.uuid(),
  event_type: z.string(),
  processing_status: z.string(),
  provider: z.string(),
  raw_payload: z.record(z.string(), z.unknown()),
  whatsapp_account_id: z.uuid(),
}).strict();

export type WhatsAppEventRow = z.infer<typeof eventRowSchema>;

export async function loadWhatsAppEvent(eventId: string, executor: WhatsAppRpcExecutor) {
  if (!z.uuid().safeParse(eventId).success) return { ok: false, code: "invalid_input" } as const;
  try {
    const result = await executor.rpc("get_whatsapp_event_for_processing", { p_event_id: eventId });
    if (result.error) return { ok: false, code: "unavailable" } as const;
    const parsed = z.array(eventRowSchema).max(1).safeParse(result.data);
    if (!parsed.success) return { ok: false, code: "unavailable" } as const;
    const row = parsed.data[0];
    return row ? { ok: true, event: row } as const : { ok: false, code: "not_found" } as const;
  } catch {
    return { ok: false, code: "unavailable" } as const;
  }
}

export async function markWhatsAppEventIgnored(eventId: string, executor: WhatsAppRpcExecutor) {
  try {
    const result = await executor.rpc("mark_whatsapp_event_ignored", { p_event_id: eventId });
    return result.error ? { ok: false, code: "unavailable" } as const : { ok: true } as const;
  } catch {
    return { ok: false, code: "unavailable" } as const;
  }
}

const credentialRowSchema = z.object({
  attachment_metadata: z.record(z.string(), z.unknown()),
  clinic_id: z.uuid(),
  external_account_id: z.string(),
  key_version: z.number().int(),
  message_type: z.string(),
  phone_e164: z.string().nullable(),
  provider: z.string(),
  text_content: z.string().nullable(),
  token_encrypted: z.string(),
  whatsapp_account_id: z.uuid(),
}).strict();

const deliverInputSchema = z.object({
  attemptId: z.uuid(),
  messageId: z.uuid(),
}).strict();

async function recordResult(
  executor: WhatsAppRpcExecutor,
  input: {
    attemptId: string;
    clinicId: string;
    errorCode: string | null;
    externalMessageId: string | null;
    messageId: string;
    status: "sent" | "failed";
  },
) {
  const result = await executor.rpc("record_whatsapp_send_result", {
    p_attempt_id: input.attemptId,
    p_clinic_id: input.clinicId,
    p_error_code: input.errorCode,
    p_external_message_id: input.externalMessageId,
    p_message_id: input.messageId,
    p_occurred_at: new Date().toISOString(),
    p_status: input.status,
  });
  return !result.error;
}

/**
 * `retryable` no retorno diz ao worker se vale responder 5xx para a fila
 * reentregar. Uma falha definitiva (token ilegível, provedor recusou) já foi
 * gravada como `failed` na tentativa — reentregar só repetiria o mesmo erro e
 * atrasaria o DLQ.
 */
export async function deliverWhatsAppMessage(input: unknown, executor: WhatsAppRpcExecutor) {
  const parsed = deliverInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input", retryable: false } as const;

  let credential;
  try {
    const result = await executor.rpc("get_whatsapp_send_credential", {
      p_message_id: parsed.data.messageId,
    });
    if (result.error) return { ok: false, code: "unavailable", retryable: true } as const;
    const rows = z.array(credentialRowSchema).max(1).safeParse(result.data);
    if (!rows.success) return { ok: false, code: "unavailable", retryable: true } as const;
    credential = rows.data[0];
  } catch {
    return { ok: false, code: "unavailable", retryable: true } as const;
  }

  // Sem linha não há nem clinic_id para gravar a falha: a mensagem sumiu, a
  // conta foi desativada ou o token nunca foi cadastrado. Nada a reentregar.
  if (!credential) return { ok: false, code: "not_deliverable", retryable: false } as const;

  const fail = async (errorCode: string) => {
    await recordResult(executor, {
      attemptId: parsed.data.attemptId,
      clinicId: credential.clinic_id,
      errorCode,
      externalMessageId: null,
      messageId: parsed.data.messageId,
      status: "failed",
    });
    return { ok: false, code: errorCode, retryable: false } as const;
  };

  if (credential.provider !== UAZAPI_PROVIDER) return fail("provider_unsupported");
  // MVP só envia texto (decisão D3): mídia de saída fica para a onda seguinte.
  if (credential.message_type !== "text" || !credential.text_content?.trim()) {
    return fail("message_type_unsupported");
  }
  if (!credential.phone_e164) return fail("contact_phone_missing");

  const baseUrl = serverEnv.UAZAPI_API_BASE_URL;
  if (!baseUrl) return fail("provider_not_configured");

  const token = decryptProviderToken(credential.token_encrypted);
  if (!token) return fail("credential_unreadable");

  const sent = await sendUazapiTextMessage({
    baseUrl,
    phoneE164: credential.phone_e164,
    text: credential.text_content,
    token,
  });

  if (!sent.ok) {
    // Falha reentregável não fecha a tentativa: fechá-la faria a reentrega cair
    // no caminho de idempotência e devolver "duplicado" sem nunca enviar.
    if (sent.retryable) return { ok: false, code: sent.errorCode, retryable: true } as const;
    return fail(sent.errorCode);
  }

  const recorded = await recordResult(executor, {
    attemptId: parsed.data.attemptId,
    clinicId: credential.clinic_id,
    errorCode: null,
    externalMessageId: sent.externalMessageId,
    messageId: parsed.data.messageId,
    status: "sent",
  });

  // Enviado e não gravado é o pior caso: reentregar mandaria a mensagem duas
  // vezes ao paciente. O 2xx encerra o job e a mensagem fica `pending` até o
  // callback de status do provedor alcançá-la pelo id externo.
  return recorded
    ? { ok: true, externalMessageId: sent.externalMessageId } as const
    : { ok: false, code: "result_not_recorded", retryable: false } as const;
}
