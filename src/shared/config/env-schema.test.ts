import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseEnv, serverEnvSchema } from "./env-schema";

const validEnv = {
  ACTIVE_CLINIC_COOKIE_SECRET: "a".repeat(32),
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-public-key",
};

describe("validação de ambiente (F0.5)", () => {
  it("aceita configuração válida", () => {
    const env = parseEnv(serverEnvSchema, { ...validEnv, APP_ENV: "staging" });
    expect(env.APP_ENV).toBe("staging");
  });

  it("usa development como padrão quando APP_ENV está ausente", () => {
    const env = parseEnv(serverEnvSchema, validEnv);
    expect(env.APP_ENV).toBe("development");
  });

  it("rejeita valor inválido citando o NOME da variável", () => {
    expect(() =>
      parseEnv(serverEnvSchema, { ...validEnv, APP_ENV: "prod-oops" }),
    ).toThrowError(/APP_ENV/);
  });

  it("nunca inclui o VALOR recebido na mensagem de erro (pode ser segredo)", () => {
    const secretLike = "sk_live_super_secreto_123";
    const schema = z.object({ FUTURE_API_KEY: z.string().min(64) });
    let message = "";
    try {
      parseEnv(schema, { FUTURE_API_KEY: secretLike });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("FUTURE_API_KEY");
    expect(message).not.toContain(secretLike);
  });

  it("mantém o segredo da clínica ativa fora do schema público", async () => {
    const { clientEnvSchema } = await import("./env-schema");
    expect("ACTIVE_CLINIC_COOKIE_SECRET" in clientEnvSchema.shape).toBe(false);
  });
});
