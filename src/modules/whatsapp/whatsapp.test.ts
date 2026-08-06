import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/auth", () => ({ requirePermission: vi.fn() }));
vi.mock("@/shared/db", () => ({ createServerSupabaseClient: vi.fn() }));

let api: typeof import("./index");

beforeAll(async () => {
  api = await import("./index");
});

function dependencies(overrides: Record<string, unknown> = {}) {
  const store = {
    ingest: vi.fn().mockResolvedValue({ duplicate: false, eventId: crypto.randomUUID() }),
    processMessage: vi.fn().mockResolvedValue({
      contactId: crypto.randomUUID(), conversationId: crypto.randomUUID(), duplicate: false,
      eventId: crypto.randomUUID(), messageId: crypto.randomUUID(), opportunityId: crypto.randomUUID(),
    }),
    retry: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
  const queue = { publish: vi.fn().mockResolvedValue({ code: "ok", enqueued: true }) };
  return { queue, store };
}

describe("fronteira provider-neutral do WhatsApp", () => {
  it("persiste antes de enfileirar e usa somente o eventId no job", async () => {
    const deps = dependencies();
    const result = await api.ingestWhatsAppEvent({
      accountExternalId: "phone-number-1",
      eventType: "message.received",
      externalEventId: "event-1",
      provider: "provider_test",
      rawPayload: { body: "conteúdo fictício" },
    }, deps);
    expect(result).toMatchObject({ ok: true, duplicate: false, queued: true });
    expect(deps.store.ingest.mock.invocationCallOrder[0]).toBeLessThan(
      deps.queue.publish.mock.invocationCallOrder[0]!,
    );
    expect(deps.queue.publish).toHaveBeenCalledWith(expect.objectContaining({
      kind: "whatsapp.process-event",
      payload: { eventId: expect.any(String) },
    }));
  });

  it("reenfileira evento duplicado em vez de deixá-lo órfão", async () => {
    // A reentrega do provedor é o que recupera um evento que persistiu mas não
    // chegou à fila. Sair cedo aqui devolveria 200 e encerraria as reentregas.
    const eventId = crypto.randomUUID();
    const deps = dependencies({ ingest: vi.fn().mockResolvedValue({ duplicate: true, eventId }) });
    const result = await api.ingestWhatsAppEvent({
      accountExternalId: "account", eventType: "message", externalEventId: "same",
      provider: "neutral", rawPayload: {},
    }, deps);
    expect(result).toMatchObject({ ok: true, duplicate: true, eventId, queued: true });
    expect(deps.queue.publish).toHaveBeenCalledWith(expect.objectContaining({
      dedupeKey: eventId,
      payload: { eventId },
    }));
  });

  it("não confirma o evento quando a fila recusa o enfileiramento", async () => {
    const eventId = crypto.randomUUID();
    const deps = dependencies({ ingest: vi.fn().mockResolvedValue({ duplicate: false, eventId }) });
    deps.queue.publish.mockResolvedValue({ code: "rejected", enqueued: false });
    const result = await api.ingestWhatsAppEvent({
      accountExternalId: "account", eventType: "message", externalEventId: "event",
      provider: "neutral", rawPayload: {},
    }, deps);
    // ok:false mantém a reentrega do provedor; o evento já está durável.
    expect(result).toMatchObject({ ok: false, code: "not_queued", eventId });
  });

  it("não confirma o evento quando a fila lança", async () => {
    const eventId = crypto.randomUUID();
    const deps = dependencies({ ingest: vi.fn().mockResolvedValue({ duplicate: false, eventId }) });
    deps.queue.publish.mockRejectedValue(new Error("queue offline"));
    const result = await api.ingestWhatsAppEvent({
      accountExternalId: "account", eventType: "message", externalEventId: "event",
      provider: "neutral", rawPayload: {},
    }, deps);
    expect(result).toEqual({ ok: false, code: "unavailable" });
  });

  it("recupera o evento órfão na reentrega depois de a fila voltar", async () => {
    // Cenário completo do bug: fila fora do ar na primeira entrega, provedor
    // reentrega, fila de volta. O evento precisa terminar enfileirado.
    const eventId = crypto.randomUUID();
    const deps = dependencies({ ingest: vi.fn().mockResolvedValue({ duplicate: false, eventId }) });
    const payload = {
      accountExternalId: "account", eventType: "message", externalEventId: "event",
      provider: "neutral", rawPayload: {},
    };

    deps.queue.publish.mockRejectedValueOnce(new Error("queue offline"));
    expect(await api.ingestWhatsAppEvent(payload, deps)).toMatchObject({ ok: false });

    deps.store.ingest.mockResolvedValue({ duplicate: true, eventId });
    const retry = await api.ingestWhatsAppEvent(payload, deps);

    expect(retry).toMatchObject({ ok: true, duplicate: true, eventId, queued: true });
    expect(deps.queue.publish).toHaveBeenCalledTimes(2);
  });

  it("remove segredos recursivos do payload sem alterar o original", () => {
    const original = {
      authorization: "Bearer secret",
      nested: { access_token: "secret", body: "mensagem" },
      rows: [{ cookie: "secret", id: 1 }],
    };
    expect(api.sanitizeWhatsAppPayload(original)).toEqual({
      nested: { body: "mensagem" }, rows: [{ id: 1 }],
    });
    expect(original.nested.access_token).toBe("secret");
  });

  it("preserva tipo desconhecido e metadados seguros", () => {
    const parsed = api.normalizedWhatsAppMessageSchema.parse({
      attachmentMetadata: { mediaId: "media-1", mimeType: "application/octet-stream" },
      contactName: "Contato Fictício",
      direction: "inbound",
      eventId: crypto.randomUUID(),
      externalMessageId: "message-1",
      messageType: "unknown",
      occurredAt: new Date().toISOString(),
      phone: "+5511999999999",
      providerPayloadType: "future_interactive_type",
    });
    expect(parsed.messageType).toBe("unknown");
    expect(parsed.providerPayloadType).toBe("future_interactive_type");
  });

  it("rejeita telefone inválido antes da persistência de domínio", async () => {
    const deps = dependencies();
    const result = await api.processWhatsAppEvent({
      contactName: "Contato Fictício", direction: "inbound",
      eventId: crypto.randomUUID(), externalMessageId: "message-1",
      messageType: "text", occurredAt: new Date().toISOString(),
      phone: "telefone inválido", textContent: "Olá",
    }, deps);
    expect(result).toEqual({ ok: false, code: "invalid_phone" });
    expect(deps.store.processMessage).not.toHaveBeenCalled();
  });

  it("normaliza telefone internacional e mantém falha reprocessável", async () => {
    const deps = dependencies({ processMessage: vi.fn().mockResolvedValue({ errorCode: "db_busy" }) });
    const result = await api.processWhatsAppEvent({
      contactName: "Contato Internacional", direction: "inbound",
      eventId: crypto.randomUUID(), externalMessageId: "message-2",
      messageType: "text", occurredAt: new Date().toISOString(),
      phone: "+14155552671", textContent: "Hello",
    }, deps);
    expect(deps.store.processMessage).toHaveBeenCalledWith(expect.objectContaining({
      phoneE164: "+14155552671",
    }));
    expect(result).toEqual({ ok: false, code: "processing_failed", retryable: true });
  });

  it("valida attachment metadata por allowlist estrita", () => {
    expect(api.safeAttachmentMetadataSchema.safeParse({ mediaId: "ok", signedUrl: "secret" }).success)
      .toBe(false);
  });
});
