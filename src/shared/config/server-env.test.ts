import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Contrato da configuração de servidor: importar o módulo nunca valida nada —
 * é o que permite `next build` rodar sem os segredos de execução. Ler uma
 * variável valida, memoiza e falha alto quando o ambiente está incompleto.
 */

const validEnv = {
  ACTIVE_CLINIC_COOKIE_SECRET: "a".repeat(32),
  APP_URL: "http://127.0.0.1:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-public-key",
} as const;

const managedKeys = [
  ...Object.keys(validEnv),
  "APP_ENV",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(managedKeys.map((key) => [key, process.env[key]]));
  for (const key of managedKeys) delete process.env[key];
  vi.resetModules();
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("configuração de servidor", () => {
  it("importa sem validar, mesmo com o ambiente inteiro ausente", async () => {
    // Se isto lançar, o `next build` volta a exigir segredos de execução.
    await expect(import("./index")).resolves.toBeDefined();
  });

  it("falha alto na primeira leitura quando falta configuração", async () => {
    const { serverEnv } = await import("./index");
    expect(() => serverEnv.APP_URL).toThrowError(/APP_URL/);
  });

  it("cita apenas nomes de variáveis, nunca valores", async () => {
    process.env.ACTIVE_CLINIC_COOKIE_SECRET = "curto-demais";
    const { serverEnv } = await import("./index");
    let message = "";
    try {
      void serverEnv.ACTIVE_CLINIC_COOKIE_SECRET;
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("ACTIVE_CLINIC_COOKIE_SECRET");
    expect(message).not.toContain("curto-demais");
  });

  it("lê todas as variáveis do ambiente válido", async () => {
    Object.assign(process.env, validEnv, { APP_ENV: "staging" });
    const { serverEnv } = await import("./index");
    expect({
      ACTIVE_CLINIC_COOKIE_SECRET: serverEnv.ACTIVE_CLINIC_COOKIE_SECRET,
      APP_ENV: serverEnv.APP_ENV,
      APP_URL: serverEnv.APP_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: serverEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_SUPABASE_URL: serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    }).toEqual({ ...validEnv, APP_ENV: "staging" });
  });

  it("memoiza: mudar o ambiente depois da primeira leitura não muda o valor", async () => {
    Object.assign(process.env, validEnv);
    const { serverEnv } = await import("./index");
    expect(serverEnv.APP_URL).toBe(validEnv.APP_URL);
    process.env.APP_URL = "http://127.0.0.1:9999";
    expect(serverEnv.APP_URL).toBe(validEnv.APP_URL);
  });
});
