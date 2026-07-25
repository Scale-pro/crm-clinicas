import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/shared/db/database.types";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

function requireLocalStack() {
  const url = process.env.API_URL;
  const key = process.env.SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase local de testes não configurado.");
  }

  const parsed = new URL(url);
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error("O helper administrativo aceita somente a stack Supabase local.");
  }

  return { key, url };
}

function requireLocalPublicStack() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Credenciais públicas da stack Supabase local não configuradas.");
  }

  const parsed = new URL(url);
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error("O cliente autenticado aceita somente a stack Supabase local.");
  }

  return { key, url };
}

/**
 * Cliente administrativo exclusivo dos testes de integração. A validação de
 * loopback impede o uso acidental com qualquer projeto remoto.
 */
export function createTestAdminClient() {
  const { key, url } = requireLocalStack();
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Cliente de usuário final: usa apenas a chave pública produzida pela stack
 * local. A autorização real vem do JWT obtido no sign-in do usuário fictício.
 */
export function createTestUserClient() {
  const { key, url } = requireLocalPublicStack();
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
