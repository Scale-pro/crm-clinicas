import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const KEY = Buffer.alloc(32, 7).toString("base64");
const ENV = {
  ACTIVE_CLINIC_COOKIE_SECRET: "a".repeat(32),
  APP_URL: "http://127.0.0.1:3000",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-public-key",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  WHATSAPP_CREDENTIAL_KEY: KEY,
} as const;
const managedKeys = Object.keys(ENV) as (keyof typeof ENV)[];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(managedKeys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, ENV);
  vi.resetModules();
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("cifragem do token do provedor (D1)", () => {
  it("decifra exatamente o que cifrou", async () => {
    const { decryptProviderToken, encryptProviderToken } = await import("./credentials");
    const encrypted = encryptProviderToken("token-ficticio-super-secreto");
    expect(decryptProviderToken(encrypted)).toBe("token-ficticio-super-secreto");
  });

  it("recusa payload com tag de autenticação de comprimento errado", async () => {
    const { decryptProviderToken, encryptProviderToken } = await import("./credentials");
    const encrypted = encryptProviderToken("token-ficticio");
    const [version, iv, tag, payload] = encrypted.split(".");
    // Trunca a tag: um GCM sem `authTagLength` fixo poderia aceitar isso e
    // enfraquecer a autenticação — é exatamente o que o SAST sinalizou.
    const truncatedTag = Buffer.from(tag!, "base64url").subarray(0, 8).toString("base64url");
    expect(decryptProviderToken([version, iv, truncatedTag, payload].join("."))).toBeNull();
  });

  it("recusa texto cifrado adulterado", async () => {
    const { decryptProviderToken, encryptProviderToken } = await import("./credentials");
    const encrypted = encryptProviderToken("token-ficticio");
    const [version, iv, tag, payload] = encrypted.split(".");
    const tampered = Buffer.from(payload!, "base64url");
    tampered[0] = (tampered[0]! + 1) % 256;
    expect(decryptProviderToken([version, iv, tag, tampered.toString("base64url")].join(".")))
      .toBeNull();
  });

  it("recusa formato desconhecido sem lançar", async () => {
    const { decryptProviderToken } = await import("./credentials");
    expect(decryptProviderToken("lixo")).toBeNull();
    expect(decryptProviderToken("v2.a.b.c")).toBeNull();
  });
});
