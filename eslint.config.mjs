import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Regras de fronteira e segurança (ADR-003, ADR-009, ADR-012, CLAUDE.md):
 * - SDKs de banco/fila só nas camadas autorizadas de shared/.
 * - Módulos expõem apenas index.ts; internals de outro módulo são proibidos.
 * - `console` direto é proibido fora do logger sanitizado de shared/observability.
 */

const restrictedSdkPatterns = {
  supabase: {
    group: ["@supabase/*", "@supabase"],
    message:
      "SDK do Supabase apenas em src/shared/db (e sessão em src/shared/auth) — ADR-002.",
  },
  upstash: {
    group: ["@upstash/*", "@upstash"],
    message: "SDK de fila (QStash/Upstash) apenas em src/shared/queue — ADR-009.",
  },
  moduleInternals: {
    group: ["@/modules/*/*", "!@/modules/*/index"],
    message:
      "Importe apenas a interface pública do módulo (@/modules/<nome>) — ADR-003.",
  },
  testAdminHelper: {
    regex:
      "(^|/)tests/integration/helpers/create-test-admin-client(?:\\.[cm]?[jt]s)?$",
    message: "O cliente administrativo local pertence exclusivamente aos testes.",
  },
};

export default defineConfig([
  globalIgnores([".next/**", "node_modules/**", "coverage/**", "out/**"]),
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-console": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            restrictedSdkPatterns.supabase,
            restrictedSdkPatterns.upstash,
            restrictedSdkPatterns.moduleInternals,
            restrictedSdkPatterns.testAdminHelper,
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "FunctionDeclaration[id.name='createServiceRoleClient'], VariableDeclarator[id.name='createServiceRoleClient']",
          message: "É proibido criar cliente service role em src/.",
        },
      ],
    },
  },
  {
    // Única camada autorizada a usar o SDK do Supabase (ADR-002).
    files: ["src/shared/db/**", "src/shared/auth/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            restrictedSdkPatterns.upstash,
            restrictedSdkPatterns.moduleInternals,
            restrictedSdkPatterns.testAdminHelper,
          ],
        },
      ],
    },
  },
  {
    // Única camada autorizada a usar o SDK da fila (ADR-009).
    files: ["src/shared/queue/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            restrictedSdkPatterns.supabase,
            restrictedSdkPatterns.moduleInternals,
            restrictedSdkPatterns.testAdminHelper,
          ],
        },
      ],
    },
  },
  {
    // Exceção fechada: cliente administrativo exclusivo da stack local de testes.
    files: ["tests/integration/helpers/create-test-admin-client.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            restrictedSdkPatterns.upstash,
            restrictedSdkPatterns.moduleInternals,
            restrictedSdkPatterns.testAdminHelper,
          ],
        },
      ],
    },
  },
  {
    // Logger sanitizado é o único lugar com acesso a console (CLAUDE.md).
    files: ["src/shared/observability/**"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // Scripts de linha de comando fora de `src/`: não são código de aplicação
    // e não atendem requisição nenhuma, então o terminal É a saída deles.
    // A proibição de `console` protege o log do servidor de vazar dado
    // pessoal (ADR-012) — aqui não há servidor nem dado real, só ferramenta
    // de desenvolvimento com fixtures fictícias.
    files: ["scripts/**"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // Exceção fechada, mais específica: script de seed de desenvolvimento,
    // opt-in e fora de src/ — não é código de aplicação, então não está
    // sujeito às fronteiras de módulo nem ao logger sanitizado (CLAUDE.md —
    // "seeds" na lista fechada de uso de service role). Vem depois do bloco
    // geral de `scripts/**` para acrescentar a permissão de import do SDK
    // sem afrouxar isso para o resto de `scripts/`.
    files: ["scripts/seed-dev/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [restrictedSdkPatterns.upstash, restrictedSdkPatterns.moduleInternals],
        },
      ],
    },
  },
]);
