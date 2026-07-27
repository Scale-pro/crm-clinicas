import "server-only";

import { parseEnv, serverEnvSchema, type ServerEnv } from "./env-schema";

/**
 * Configuração de servidor (F0.5). O `import "server-only"` garante em tempo
 * de build que este módulo — e portanto qualquer segredo futuro — jamais
 * entre no bundle do navegador.
 *
 * Validação eager: configuração inválida falha na subida, não no meio de uma
 * requisição.
 */
export const serverEnv: ServerEnv = parseEnv(serverEnvSchema, {
  APP_URL: process.env.APP_URL,
  APP_ENV: process.env.APP_ENV,
  ACTIVE_CLINIC_COOKIE_SECRET: process.env.ACTIVE_CLINIC_COOKIE_SECRET,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

export type { ServerEnv };
