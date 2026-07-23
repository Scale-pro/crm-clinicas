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
export const serverEnvSchema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
});

/**
 * Variáveis públicas (client). Nenhuma é necessária na fundação; o schema
 * existe para fixar o mecanismo — novas chaves NEXT_PUBLIC_* entram aqui.
 */
export const clientEnvSchema = z.object({});

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
