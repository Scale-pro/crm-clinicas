import "server-only";

import { parseEnv, serverEnvSchema, type ServerEnv } from "./env-schema";

/**
 * Configuração de servidor (F0.5). O `import "server-only"` garante em tempo
 * de build que este módulo — e portanto qualquer segredo futuro — jamais
 * entre no bundle do navegador.
 *
 * A validação é **preguiçosa e memoizada**: acontece na primeira leitura de
 * uma variável, não no import do módulo.
 *
 * O motivo é concreto: `next build` importa todos os módulos de rota para
 * coletar dados de página, então validar no import faz o **build** exigir os
 * segredos de execução. Qualquer build sem o ambiente completo quebra por um
 * motivo que nada tem a ver com compilar — foi o que derrubou o deploy de
 * preview. Segredo é insumo de execução, não de compilação.
 *
 * A garantia original continua de pé: nenhuma requisição é atendida com
 * configuração inválida. Toda leitura passa por `parseEnv`, e a primeira delas
 * em um processo mal configurado falha com o mesmo erro alto e claro, citando
 * apenas os **nomes** das variáveis — nunca os valores.
 */

let cached: ServerEnv | null = null;

function readServerEnv(): ServerEnv {
  cached ??= parseEnv(serverEnvSchema, {
    APP_URL: process.env.APP_URL,
    APP_ENV: process.env.APP_ENV,
    ACTIVE_CLINIC_COOKIE_SECRET: process.env.ACTIVE_CLINIC_COOKIE_SECRET,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    UAZAPI_WEBHOOK_SECRET: process.env.UAZAPI_WEBHOOK_SECRET,
    UAZAPI_API_BASE_URL: process.env.UAZAPI_API_BASE_URL,
    WHATSAPP_CREDENTIAL_KEY: process.env.WHATSAPP_CREDENTIAL_KEY,
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
  });
  return cached;
}

/**
 * Cada variável é um getter explícito — nada de `Proxy`. A superfície exposta
 * ao servidor continua legível em uma olhada, e acrescentar uma chave exige
 * acrescentá-la aqui, à vista de quem revisa.
 */
export const serverEnv: ServerEnv = {
  get APP_URL() {
    return readServerEnv().APP_URL;
  },
  get APP_ENV() {
    return readServerEnv().APP_ENV;
  },
  get ACTIVE_CLINIC_COOKIE_SECRET() {
    return readServerEnv().ACTIVE_CLINIC_COOKIE_SECRET;
  },
  get NEXT_PUBLIC_SUPABASE_URL() {
    return readServerEnv().NEXT_PUBLIC_SUPABASE_URL;
  },
  get NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY() {
    return readServerEnv().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  },
  get SUPABASE_SECRET_KEY() {
    return readServerEnv().SUPABASE_SECRET_KEY;
  },
  get UAZAPI_WEBHOOK_SECRET() {
    return readServerEnv().UAZAPI_WEBHOOK_SECRET;
  },
  get UAZAPI_API_BASE_URL() {
    return readServerEnv().UAZAPI_API_BASE_URL;
  },
  get WHATSAPP_CREDENTIAL_KEY() {
    return readServerEnv().WHATSAPP_CREDENTIAL_KEY;
  },
  get QSTASH_TOKEN() {
    return readServerEnv().QSTASH_TOKEN;
  },
  get QSTASH_CURRENT_SIGNING_KEY() {
    return readServerEnv().QSTASH_CURRENT_SIGNING_KEY;
  },
  get QSTASH_NEXT_SIGNING_KEY() {
    return readServerEnv().QSTASH_NEXT_SIGNING_KEY;
  },
};

export type { ServerEnv };
