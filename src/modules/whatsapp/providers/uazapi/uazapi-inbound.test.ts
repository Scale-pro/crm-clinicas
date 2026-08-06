import { describe, expect, it } from "vitest";

import {
  ACCOUNT_EXTERNAL_ID,
  groupMessage,
  inboundAudioMessage,
  inboundDocumentMessage,
  inboundImageMessage,
  inboundTextMessage,
  mirroredOutboundMessage,
  presenceEvent,
  statusUpdate,
} from "./__fixtures__/inbound";
import { extractEnvelope, toNormalizedMessage, toStatusUpdate } from "./inbound";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";

describe("adapter de entrada da UAZAPI", () => {
  it("classifica mensagem, status e ruído", () => {
    expect(extractEnvelope(inboundTextMessage)?.kind).toBe("message");
    expect(extractEnvelope(statusUpdate("DELIVERY_ACK"))?.kind).toBe("status");
    expect(extractEnvelope(presenceEvent)?.kind).toBe("ignored");
  });

  it("resolve a conta que recebeu o evento", () => {
    expect(extractEnvelope(inboundTextMessage)?.accountExternalId).toBe(ACCOUNT_EXTERNAL_ID);
  });

  /*
   * O caso que já quebrou este desenho uma vez: `whatsapp_webhook_events` é
   * único por (conta, external_event_id) e a UAZAPI reusa o id da mensagem no
   * callback de status. Sem prefixo, o `delivered` seria descartado como
   * reentrega do recebimento e a mensagem nunca sairia de "enviada".
   */
  it("não deixa mensagem e seus status colidirem na chave de idempotência", () => {
    const ids = [
      extractEnvelope(inboundTextMessage)?.externalEventId,
      extractEnvelope(statusUpdate("SERVER_ACK"))?.externalEventId,
      extractEnvelope(statusUpdate("DELIVERY_ACK"))?.externalEventId,
      extractEnvelope(statusUpdate("READ"))?.externalEventId,
    ];

    expect(new Set(ids).size).toBe(4);
  });

  it("recusa payload que não é objeto ou não identifica a conta", () => {
    expect(extractEnvelope(null)).toBeNull();
    expect(extractEnvelope([inboundTextMessage])).toBeNull();
    expect(extractEnvelope("{}")).toBeNull();
    expect(extractEnvelope({ EventType: "messages" })).toBeNull();
  });

  it("traduz mensagem de texto para o contrato normalizado", () => {
    const result = toNormalizedMessage(inboundTextMessage, EVENT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Mensagem de texto deveria traduzir.");
    expect(result.value).toMatchObject({
      contactName: "Marina Fictícia",
      direction: "inbound",
      eventId: EVENT_ID,
      externalMessageId: "3EB0FICTICIO0001",
      messageType: "text",
      phone: "5511987654321",
      providerPayloadType: "conversation",
      textContent: "Bom dia! Queria saber o valor da avaliação.",
    });
    expect(result.value.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("mapeia os tipos de mídia e guarda só metadados seguros", () => {
    const audio = toNormalizedMessage(inboundAudioMessage, EVENT_ID);
    const image = toNormalizedMessage(inboundImageMessage, EVENT_ID);
    const document = toNormalizedMessage(inboundDocumentMessage, EVENT_ID);
    if (!audio.ok || !image.ok || !document.ok) throw new Error("Mídia deveria traduzir.");

    expect(audio.value.messageType).toBe("audio");
    expect(image.value.messageType).toBe("image");
    expect(document.value.messageType).toBe("document");

    expect(audio.value.attachmentMetadata).toEqual({
      mediaId: "/v/t62.7117-24/ficticio",
      mimeType: "audio/ogg; codecs=opus",
      sizeBytes: 20_480,
    });
    expect(document.value.attachmentMetadata.fileName).toBe("orcamento-ficticio.pdf");
    expect(image.value.attachmentMetadata.caption).toBe("Foto de referência");

    // Nenhum binário e nenhuma URL assinada entram no domínio (ADR-012, D3).
    for (const message of [audio, image, document]) {
      expect(Object.keys(message.value.attachmentMetadata)).not.toContain("url");
      expect(Object.keys(message.value.attachmentMetadata)).not.toContain("base64");
    }
  });

  it("trata mensagem espelhada do atendente como histórico de saída", () => {
    const result = toNormalizedMessage(mirroredOutboundMessage, EVENT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Mensagem espelhada deveria traduzir.");
    expect(result.value.direction).toBe("outbound");
  });

  /*
   * Grupo não é lead: tem vários participantes e nenhum telefone único para
   * virar contato. Deixar passar criaria um contato com o id do grupo.
   */
  it("recusa mensagem de grupo", () => {
    expect(toNormalizedMessage(groupMessage, EVENT_ID)).toEqual({
      ok: false,
      code: "invalid_payload",
    });
  });

  it("recusa mensagem sem id, sem telefone ou sem horário", () => {
    const withoutTimestamp = {
      ...inboundTextMessage,
      message: { ...inboundTextMessage.message, messageTimestamp: 0 },
    };

    expect(toNormalizedMessage({ EventType: "messages" }, EVENT_ID).ok).toBe(false);
    expect(toNormalizedMessage(withoutTimestamp, EVENT_ID).ok).toBe(false);
  });

  it("preserva o tipo cru do provedor e cai em unknown quando não conhece", () => {
    const exotic = {
      ...inboundTextMessage,
      message: { ...inboundTextMessage.message, messageType: "pollCreationMessage" },
    };
    const result = toNormalizedMessage(exotic, EVENT_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Tipo desconhecido deveria traduzir como unknown.");
    expect(result.value.messageType).toBe("unknown");
    expect(result.value.providerPayloadType).toBe("pollCreationMessage");
  });

  it("mapeia o ack do provedor, textual e numérico, para o enum do domínio", () => {
    const cases: readonly [string, string][] = [
      ["SERVER_ACK", "sent"],
      ["DELIVERY_ACK", "delivered"],
      ["READ", "read"],
      ["PLAYED", "read"],
      ["ERROR", "failed"],
      ["3", "delivered"],
      ["4", "read"],
    ];

    for (const [provider, expected] of cases) {
      const result = toStatusUpdate(statusUpdate(provider));
      expect(result.ok, provider).toBe(true);
      if (!result.ok) continue;
      expect(result.value.status, provider).toBe(expected);
      expect(result.value.externalMessageId).toBe("3EB0FICTICIO0001");
    }
  });

  it("recusa status que não reconhece em vez de inventar um", () => {
    expect(toStatusUpdate(statusUpdate("QUALQUER_COISA")).ok).toBe(false);
    expect(toStatusUpdate({ EventType: "messages_update" }).ok).toBe(false);
  });
});
