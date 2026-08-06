/**
 * Cliente HTTP de envio da UAZAPI.
 *
 * Único arquivo que conhece o formato de saída do provedor. Devolve sempre um
 * resultado descrito no vocabulário do domínio (`sent` / `failed` + código
 * interno) — nada de status HTTP, corpo de resposta ou mensagem do provedor
 * vazando para quem chama, porque isso acabaria em log (ADR-012).
 */

const SEND_TIMEOUT_MS = 10_000;

export type UazapiSendResult =
  | { readonly ok: true; readonly externalMessageId: string }
  | { readonly ok: false; readonly errorCode: string; readonly retryable: boolean };

export type UazapiSendInput = {
  readonly baseUrl: string;
  readonly phoneE164: string;
  readonly text: string;
  readonly token: string;
};

function readMessageId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const candidates = [
    record.messageid,
    record.id,
    (record.message as Record<string, unknown> | undefined)?.messageid,
    (record.message as Record<string, unknown> | undefined)?.id,
    ((record.key ?? {}) as Record<string, unknown>).id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim().slice(0, 240);
  }
  return null;
}

/**
 * `retryable` separa o que adianta reentregar (rede, 5xx, 429) do que só
 * repetiria o mesmo erro (400, 401, 404). Sem essa distinção, um token inválido
 * consumiria todas as tentativas da fila antes de virar DLQ, e o atendente
 * demoraria minutos para ver que a mensagem não saiu.
 */
export async function sendUazapiTextMessage(
  input: UazapiSendInput,
): Promise<UazapiSendResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetch(new URL("/send/text", input.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", token: input.token },
      body: JSON.stringify({ number: input.phoneE164, text: input.text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      return { ok: false, errorCode: retryable ? "provider_unavailable" : "provider_rejected", retryable };
    }

    const body = await response.json().catch(() => null);
    const externalMessageId = readMessageId(body);
    if (!externalMessageId) {
      // Aceito pelo provedor mas sem id: a mensagem provavelmente saiu, e
      // repetir o envio duplicaria para o paciente. Marcar como falha sem
      // reenviar é o menor dano — o espelho da mensagem chega pelo webhook.
      return { ok: false, errorCode: "provider_missing_message_id", retryable: false };
    }
    return { ok: true, externalMessageId };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, errorCode: aborted ? "provider_timeout" : "provider_unreachable", retryable: true };
  } finally {
    clearTimeout(timeout);
  }
}
