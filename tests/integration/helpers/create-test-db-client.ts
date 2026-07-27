import { Pool } from "pg";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

export function createTestDbPool() {
  const connectionString = process.env.DB_URL;
  if (!connectionString) {
    throw new Error("Banco Supabase local de testes não configurado.");
  }

  const parsed = new URL(connectionString);
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error("O helper PostgreSQL aceita somente a stack Supabase local.");
  }

  return new Pool({ connectionString, max: 2 });
}
