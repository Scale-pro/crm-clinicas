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
  APP_ENV: process.env.APP_ENV,
});

export type { ServerEnv };
