"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { resolveActiveClinicContext } from "@/modules/tenancy";
import {
  createOutboundMessage,
  createWhatsAppAccount,
  markConversationRead,
  setWhatsAppAccountSecret,
} from "@/modules/whatsapp";

import { whatsappErrorMessage, WHATSAPP_SETTINGS_PATH } from "./whatsapp-view";

/**
 * Server Actions do WhatsApp. Finas por definição: ligam a interface a
 * contratos que já existem em `@/modules/whatsapp`.
 *
 * - o `clinicId` sai sempre de `resolveActiveClinicContext()`; o navegador
 *   nunca informa a clínica;
 * - toda entrada passa por Zod aqui e é validada de novo no módulo e no banco;
 * - a resposta só carrega código e mensagem escritos por nós — nenhuma
 *   mensagem do Postgres, SQLSTATE ou nome de RPC atravessa a fronteira;
 * - nenhum token, telefone ou corpo de mensagem entra em log (ADR-012).
 */

export type WhatsAppActionResult =
  | { readonly ok: true; readonly id?: string; readonly warning?: string }
  | { readonly ok: false; readonly code: string; readonly message: string };

/** Sem anotação de retorno de propósito: o ramo de erro serve às duas uniões. */
function failure(code: string) {
  return { code, message: whatsappErrorMessage(code), ok: false } as const;
}

const INVALID_INPUT = failure("invalid_input");
const NO_ACTIVE_CLINIC = failure("clinic_unavailable");

async function activeClinicId(): Promise<string | null> {
  const context = await resolveActiveClinicContext();
  return context.status === "ready" ? context.clinic.id : null;
}

const connectAccountSchema = z.object({
  displayPhone: z.string().max(32),
  externalAccountId: z.string().trim().min(1).max(200),
  token: z.string().trim().min(8).max(4096),
}).strict();

/**
 * Cadastra a instância e guarda o token cifrado (decisões D1 e D4).
 *
 * A conta é criada primeiro porque o token depende do id dela. Se a segunda
 * etapa falhar, a conta fica cadastrada e sem credencial — estado visível na
 * tela como "sem token", e corrigível repetindo só a gravação do token. O
 * inverso (token órfão) não teria onde ser guardado.
 */
export async function connectWhatsAppAccountAction(input: unknown): Promise<WhatsAppActionResult> {
  const parsed = connectAccountSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const clinicId = await activeClinicId();
  if (!clinicId) return NO_ACTIVE_CLINIC;

  const account = await createWhatsAppAccount({
    clinicId,
    displayPhone: parsed.data.displayPhone.trim() || null,
    externalAccountId: parsed.data.externalAccountId,
    provider: "uazapi",
  });
  if (!account.ok) return failure(account.code);

  const secret = await setWhatsAppAccountSecret({
    clinicId,
    token: parsed.data.token,
    whatsappAccountId: account.accountId,
  });

  revalidatePath(WHATSAPP_SETTINGS_PATH);
  return secret.ok
    ? { id: account.accountId, ok: true }
    : {
      id: account.accountId,
      ok: true,
      warning: "A instância foi cadastrada, mas o token não foi salvo. Grave o token novamente.",
    };
}

const rotateTokenSchema = z.object({
  token: z.string().trim().min(8).max(4096),
  whatsappAccountId: z.uuid(),
}).strict();

export async function rotateWhatsAppTokenAction(input: unknown): Promise<WhatsAppActionResult> {
  const parsed = rotateTokenSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const clinicId = await activeClinicId();
  if (!clinicId) return NO_ACTIVE_CLINIC;

  const result = await setWhatsAppAccountSecret({
    clinicId,
    token: parsed.data.token,
    whatsappAccountId: parsed.data.whatsappAccountId,
  });
  if (!result.ok) return failure(result.code);

  revalidatePath(WHATSAPP_SETTINGS_PATH);
  return { ok: true };
}

const sendMessageSchema = z.object({
  conversationId: z.uuid(),
  textContent: z.string().trim().min(1).max(4096),
}).strict();

/**
 * Grava a intenção de envio e devolve o controle imediatamente (decisão D2).
 * A chamada ao provedor acontece no worker; a mensagem aparece como pendente e
 * vira `enviada`/`falhou` quando o resultado chega.
 */
export async function sendWhatsAppMessageAction(input: unknown): Promise<WhatsAppActionResult> {
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const clinicId = await activeClinicId();
  if (!clinicId) return NO_ACTIVE_CLINIC;

  const result = await createOutboundMessage({
    clinicId,
    conversationId: parsed.data.conversationId,
    idempotencyKey: randomUUID(),
    messageType: "text",
    textContent: parsed.data.textContent,
  });
  if (!result.ok) return failure(result.code);

  revalidatePath("/app/pipeline");
  return result.queued
    ? { id: result.messageId, ok: true }
    : {
      id: result.messageId,
      ok: true,
      warning: "A mensagem foi registrada, mas o envio ainda não foi despachado.",
    };
}

const conversationSchema = z.object({ conversationId: z.uuid() }).strict();

export async function markConversationReadAction(input: unknown): Promise<WhatsAppActionResult> {
  const parsed = conversationSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const clinicId = await activeClinicId();
  if (!clinicId) return NO_ACTIVE_CLINIC;

  const result = await markConversationRead({
    clinicId,
    conversationId: parsed.data.conversationId,
  });
  if (!result.ok) return failure(result.code);

  revalidatePath("/app/pipeline");
  return { ok: true };
}

const loadThreadSchema = z.object({ conversationId: z.uuid() }).strict();

export type WhatsAppThreadMessage = {
  readonly deliveryStatus: string | null;
  readonly direction: string;
  readonly id: string;
  readonly messageType: string;
  readonly occurredAt: string;
  readonly textContent: string | null;
};

export type WhatsAppThreadResult =
  | { readonly ok: true; readonly messages: readonly WhatsAppThreadMessage[] }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * Histórico da conversa sob demanda: o quadro carrega só a prévia de cada
 * card, e as mensagens chegam quando o painel abre. Carregar tudo junto faria
 * o Kanban pagar o custo de conversas que ninguém vai abrir.
 */
export async function loadWhatsAppThreadAction(input: unknown): Promise<WhatsAppThreadResult> {
  const parsed = loadThreadSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const clinicId = await activeClinicId();
  if (!clinicId) return NO_ACTIVE_CLINIC;

  const { listConversationMessages } = await import("@/modules/whatsapp");
  const result = await listConversationMessages({
    clinicId,
    conversationId: parsed.data.conversationId,
    pageSize: 50,
  });
  if (!result.ok) return failure(result.code);

  return {
    ok: true,
    messages: result.messages.map((message) => ({
      deliveryStatus: message.delivery_status,
      direction: message.direction,
      id: message.id,
      messageType: message.message_type,
      occurredAt: message.occurred_at,
      textContent: message.text_content,
    })),
  };
}
