// Gerador TOTP autônomo para este script — mesma lógica de
// tests/integration/helpers/totp.ts, duplicada aqui para manter scripts/
// independente de tests/ (fronteiras arquiteturais separadas).
import { createHmac } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(secret: string): Buffer {
  let bits = "";
  for (const character of secret.replaceAll("=", "").toUpperCase()) {
    const value = BASE32_ALPHABET.indexOf(character);
    if (value < 0) throw new Error("Segredo TOTP local inválido.");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

export function currentTotp(secret: string, now = Date.now()): string {
  const counter = Math.floor(now / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}
