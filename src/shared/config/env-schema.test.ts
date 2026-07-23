import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseEnv, serverEnvSchema } from "./env-schema";

describe("validação de ambiente (F0.5)", () => {
  it("aceita configuração válida", () => {
    const env = parseEnv(serverEnvSchema, { APP_ENV: "staging" });
    expect(env.APP_ENV).toBe("staging");
  });

  it("usa development como padrão quando APP_ENV está ausente", () => {
    const env = parseEnv(serverEnvSchema, {});
    expect(env.APP_ENV).toBe("development");
  });

  it("rejeita valor inválido citando o NOME da variável", () => {
    expect(() => parseEnv(serverEnvSchema, { APP_ENV: "prod-oops" })).toThrowError(
      /APP_ENV/,
    );
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
});
