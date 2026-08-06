import { z } from "zod";

/**
 * Schemas de configuração de ambiente (F0.5).
 *
 * Regras (docs/ops/environments.md):
 * - Variáveis de servidor NUNCA são expostas ao navegador.
 * - Só variáveis com prefixo NEXT_PUBLIC_ podem ser lidas no client.
 * - Mensagens de erro citam APENAS os nomes das variáveis, nunca os valores.
 * - Integrações futuras (Supabase, QStash, WhatsApp, observabilidade…)
 *   adicionam suas próprias variáveis nas fases em que forem implementadas —
 *   não criamos chaves fictícias antecipadamente.
 */

/** Ambiente lógico da aplicação (independente de NODE_ENV, que é do build). */
const supabasePublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

/**
 * Integrações do WhatsApp Core (F2, ADR-008/ADR-009/ADR-012).
 *
 * Todas são opcionais **de propósito**: sem elas a aplicação sobe e opera
 * normalmente, apenas com o WhatsApp desligado. Torná-las obrigatórias faria
 * um ambiente que não usa WhatsApp deixar de subir por falta de credencial de
 * um provedor que ele não contratou. Quem exige cada uma é o ponto de
 * composição da funcionalidade, que falha alto e citando o nome da variável no
 * momento em que ela é de fato necessária.
 */
const whatsappEnvSchema = z.object({
  /** Chave técnica do webhook: sem sessão de usuário não há JWT (ADR-002). */
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  /** Segredo compartilhado que autentica a origem do webhook do provedor. */
  UAZAPI_WEBHOOK_SECRET: z.string().min(32).optional(),
  UAZAPI_API_BASE_URL: z.url().optional(),
  /** Chave AES-256-GCM (32 bytes em base64) que cifra o token da instância. */
  WHATSAPP_CREDENTIAL_KEY: z.string().min(1).optional(),
  QSTASH_TOKEN: z.string().min(1).optional(),
  QSTASH_CURRENT_SIGNING_KEY: z.string().min(1).optional(),
  QSTASH_NEXT_SIGNING_KEY: z.string().min(1).optional(),
});

export const serverEnvSchema = supabasePublicEnvSchema.extend({
  APP_URL: z.url(),
  APP_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),
  ACTIVE_CLINIC_COOKIE_SECRET: z.string().min(32),
}).extend(whatsappEnvSchema.shape);

/**
 * Variáveis públicas (client). Nenhuma é necessária na fundação; o schema
 * existe para fixar o mecanismo — novas chaves NEXT_PUBLIC_* entram aqui.
 */
export const clientEnvSchema = supabasePublicEnvSchema;

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

/**
 * Valida um conjunto bruto de variáveis. Em caso de falha, o erro lista os
 * NOMES das variáveis inválidas — nunca os valores recebidos (podem ser
 * segredos).
 */
export function parseEnv<S extends z.ZodTypeAny>(
  schema: S,
  raw: Record<string, string | undefined>,
): z.infer<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join(".") || "(raiz)")),
    ].join(", ");
    throw new Error(
      `Configuração de ambiente inválida ou ausente: ${names}. ` +
        "Consulte docs/ops/environments.md (valores nunca são exibidos).",
    );
  }
  return result.data;
}
