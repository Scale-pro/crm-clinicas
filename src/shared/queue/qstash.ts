import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/shared/config";

import type { QueueJob, QueuePublisher } from "./contract";

/**
 * Publicador QStash (ADR-009), atrás do contrato `QueuePublisher`.
 *
 * Fala com a API REST em vez do SDK: a superfície usada é um POST e uma
 * verificação de JWT, ambos cobertos pela biblioteca padrão. Uma dependência a
 * menos é uma dependência a menos para auditar, atualizar e carregar no bundle
 * — e a fronteira do ADR continua valendo, porque nada disso escapa deste
 * diretório.
 */

const QSTASH_PUBLISH_URL = "https://qstash.upstash.io/v2/publish";

/** Cada `kind` de job tem seu endpoint; o worker roteia pelo corpo. */
function callbackUrl(): string {
  return new URL("/api/whatsapp/worker", serverEnv.APP_URL).toString();
}

export function createQStashQueuePublisher(): QueuePublisher {
  return {
    async publish(job: QueueJob) {
      const token = serverEnv.QSTASH_TOKEN;
      if (!token) return { enqueued: false, code: "not_configured" } as const;

      try {
        const response = await fetch(`${QSTASH_PUBLISH_URL}/${callbackUrl()}`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            // A deduplicação é do QStash: reentrega do provedor não vira dois
            // jobs. O processamento é idempotente de qualquer forma (ADR-008),
            // então isto poupa trabalho, não corrige correção.
            ...(job.dedupeKey ? { "Upstash-Deduplication-Id": job.dedupeKey } : {}),
            "Upstash-Retries": "3",
          },
          body: JSON.stringify({ kind: job.kind, ...(job.payload as object) }),
        });

        return response.ok
          ? { enqueued: true, code: "ok" } as const
          : { enqueued: false, code: "error" } as const;
      } catch {
        // Nunca propagar o erro de rede: o chamador decide o que fazer com a
        // falha de enfileiramento, e o corpo do erro poderia carregar o token.
        return { enqueued: false, code: "error" } as const;
      }
    },
  };
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value.replaceAll("-", "+").replaceAll("_", "/"), "base64");
}

function equal(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verifica a assinatura do QStash (JWT HS256 no header `Upstash-Signature`).
 *
 * Sem isto, qualquer um que descubra a URL do worker manda `{ eventId }`
 * arbitrário e força o reprocessamento de eventos alheios. As duas chaves
 * (atual e próxima) são aceitas para que a rotação não derrube a fila.
 *
 * O claim `body` prende a assinatura ao corpo recebido: assinar só o cabeçalho
 * deixaria trocar o payload de um pedido legítimo interceptado.
 */
export function verifyQStashSignature(signature: string | null, body: string): boolean {
  const keys = [serverEnv.QSTASH_CURRENT_SIGNING_KEY, serverEnv.QSTASH_NEXT_SIGNING_KEY]
    .filter((key): key is string => Boolean(key));
  if (!signature || keys.length === 0) return false;

  const [headerPart, payloadPart, signaturePart] = signature.split(".");
  if (!headerPart || !payloadPart || !signaturePart) return false;

  const signed = `${headerPart}.${payloadPart}`;
  const signatureMatches = keys.some((key) => {
    const expected = createHmac("sha256", key).update(signed).digest("base64url");
    return equal(expected, signaturePart);
  });
  if (!signatureMatches) return false;

  let claims: { exp?: number; nbf?: number; body?: string };
  try {
    claims = JSON.parse(base64UrlDecode(payloadPart).toString("utf8"));
  } catch {
    return false;
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number" && claims.exp < nowInSeconds) return false;
  if (typeof claims.nbf === "number" && claims.nbf > nowInSeconds) return false;

  if (typeof claims.body !== "string") return false;
  const expectedBodyHash = createHash("sha256").update(body).digest("base64url");
  // O QStash preenche o claim com padding `=`; comparar sem ele evita um
  // falso negativo que derrubaria toda a fila.
  return equal(claims.body.replace(/=+$/, ""), expectedBodyHash.replace(/=+$/, ""));
}
