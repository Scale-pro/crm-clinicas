import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { serverEnv } from "@/shared/config";

/**
 * Cifra do token da instância do provedor (decisão D1).
 *
 * A cifragem acontece **na aplicação**, não no banco. O motivo é concreto: um
 * `pgp_sym_encrypt` receberia a chave como parâmetro de RPC, e parâmetro de
 * RPC aparece em log de query lenta, em `pg_stat_statements` e em plano de
 * execução. Cifrando aqui, o Postgres só vê texto opaco — a chave nunca sai do
 * processo do servidor, e um dump do banco não contém segredo utilizável.
 *
 * AES-256-GCM: o modo autenticado detecta adulteração do texto cifrado, o que
 * um CBC/CTR puro não faria. O formato é `v1.<iv>.<tag>.<cifra>` em base64url,
 * com `v1` reservando espaço para rotação de algoritmo sem migração de dados.
 */

const VERSION = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;

function credentialKey(): Buffer {
  const raw = serverEnv.WHATSAPP_CREDENTIAL_KEY;
  if (!raw) {
    throw new Error(
      "Configuração de ambiente inválida ou ausente: WHATSAPP_CREDENTIAL_KEY. " +
        "Consulte docs/ops/environments.md (valores nunca são exibidos).",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      "Configuração de ambiente inválida ou ausente: WHATSAPP_CREDENTIAL_KEY. " +
        "Esperado 32 bytes em base64.",
    );
  }
  return key;
}

export function encryptProviderToken(token: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", credentialKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

/**
 * Devolve `null` em vez de lançar: o chamador é o worker de envio, e um token
 * ilegível (chave rotacionada sem re-cadastro, registro adulterado) é uma falha
 * de configuração da clínica — vira `failed` com código próprio na tentativa de
 * entrega, não uma exceção que derruba o processamento de outros eventos.
 */
export function decryptProviderToken(value: string): string | null {
  const [version, iv, tag, payload] = value.split(".");
  if (version !== VERSION || !iv || !tag || !payload) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      credentialKey(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(payload, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
