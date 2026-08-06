import "server-only";

import { createClient } from "@supabase/supabase-js";

import { serverEnv } from "@/shared/config";

import type { Database } from "./database.types";

/**
 * Executor técnico — a exceção fechada do ADR-002 para webhooks externos.
 *
 * Um webhook chega **sem sessão de usuário**: não há JWT, logo não há RLS para
 * aplicar. O ADR-002 (decisão 3) prevê exatamente este caso na lista fechada de
 * usos da chave técnica, junto com cron, agregação de plataforma e migrations.
 * Fora dessa lista o acesso continua sendo com a sessão do usuário.
 *
 * Três restrições mantêm a exceção estreita:
 *
 * 1. **Só `rpc`.** O executor não expõe `from()`, então nem uma rota
 *    comprometida consegue ler ou escrever tabela diretamente — só as RPCs que
 *    a migration concedeu, cada uma com validação própria e `clinic_id`
 *    resolvido no banco a partir da conta do provedor, nunca do payload.
 * 2. **Um único construtor**, aqui, na única camada autorizada a importar o SDK.
 * 3. **Consumidores nomeados** nos testes de arquitetura do WhatsApp:
 *    acrescentar um consumidor novo quebra o teste e obriga a decisão explícita.
 */
export interface TechnicalRpcExecutor {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

function requireSecretKey(): string {
  const key = serverEnv.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Configuração de ambiente inválida ou ausente: SUPABASE_SECRET_KEY. " +
        "Consulte docs/ops/environments.md (valores nunca são exibidos).",
    );
  }
  return key;
}

export function createTechnicalRpcExecutor(): TechnicalRpcExecutor {
  const client = createClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    requireSecretKey(),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  return {
    async rpc(name, args) {
      // O tipo gerado enumera as RPCs conhecidas; a porta é deliberadamente
      // textual (o mesmo contrato que `WhatsAppRpcExecutor` já usa), então o
      // cast fica contido nesta linha em vez de contaminar os chamadores.
      const result = await client.rpc(
        name as Parameters<typeof client.rpc>[0],
        args as never,
      );
      return { data: result.data, error: result.error };
    },
  };
}
