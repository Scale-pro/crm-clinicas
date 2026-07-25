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
