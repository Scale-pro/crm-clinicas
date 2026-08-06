/**
 * Amostras de payload da UAZAPI.
 *
 * ATENÇÃO — estas fixtures foram escritas a partir do formato documentado da
 * UAZAPI v2 (envelope `EventType` + objeto `message` do Baileys), **não** a
 * partir de um payload real capturado em produção. Elas travam o
 * comportamento do adapter, que é o que interessa aqui; a conferência contra
 * um evento real da instância contratada é o passo que valida o mapeamento.
 * Se algum nome de campo divergir, o ajuste é na lista de caminhos de
 * `inbound.ts` — nenhuma outra camada muda.
 *
 * Nada aqui contém dado pessoal real: números, nomes e textos são fictícios.
 */

const ACCOUNT = "instancia-ficticia-01";

export const inboundTextMessage = {
  EventType: "messages",
  instance_id: ACCOUNT,
  message: {
    chatid: "5511987654321@s.whatsapp.net",
    fromMe: false,
    messageTimestamp: 1_775_000_000,
    messageType: "conversation",
    messageid: "3EB0FICTICIO0001",
    senderName: "Marina Fictícia",
    text: "Bom dia! Queria saber o valor da avaliação.",
  },
};

export const inboundAudioMessage = {
  EventType: "messages",
  instance_id: ACCOUNT,
  message: {
    chatid: "5511987654321@s.whatsapp.net",
    directPath: "/v/t62.7117-24/ficticio",
    fileLength: 20_480,
    fromMe: false,
    messageTimestamp: 1_775_000_100,
    messageType: "pttMessage",
    messageid: "3EB0FICTICIO0002",
    mimetype: "audio/ogg; codecs=opus",
    senderName: "Marina Fictícia",
  },
};

export const inboundImageMessage = {
  EventType: "messages",
  instance_id: ACCOUNT,
  message: {
    caption: "Foto de referência",
    chatid: "5511987654321@s.whatsapp.net",
    fileLength: 102_400,
    fromMe: false,
    messageTimestamp: 1_775_000_200,
    messageType: "imageMessage",
    messageid: "3EB0FICTICIO0003",
    mimetype: "image/jpeg",
    senderName: "Marina Fictícia",
  },
};

export const inboundDocumentMessage = {
  EventType: "messages",
  instance_id: ACCOUNT,
  message: {
    chatid: "5511987654321@s.whatsapp.net",
    fileName: "orcamento-ficticio.pdf",
    fileLength: 51_200,
    fromMe: false,
    messageTimestamp: 1_775_000_300,
    messageType: "documentMessage",
    messageid: "3EB0FICTICIO0004",
    mimetype: "application/pdf",
    senderName: "Marina Fictícia",
  },
};

/** Mensagem enviada pelo celular do atendente, espelhada pelo provedor. */
export const mirroredOutboundMessage = {
  EventType: "messages",
  instance_id: ACCOUNT,
  message: {
    chatid: "5511987654321@s.whatsapp.net",
    fromMe: true,
    messageTimestamp: 1_775_000_400,
    messageType: "conversation",
    messageid: "3EB0FICTICIO0005",
    text: "Respondendo pelo celular da recepção.",
  },
};

export const groupMessage = {
  EventType: "messages",
  instance_id: ACCOUNT,
  message: {
    chatid: "120363000000000000@g.us",
    fromMe: false,
    messageTimestamp: 1_775_000_500,
    messageType: "conversation",
    messageid: "3EB0FICTICIO0006",
    senderName: "Grupo Fictício",
    text: "Mensagem de grupo.",
  },
};

export function statusUpdate(status: string, messageId = "3EB0FICTICIO0001") {
  return {
    EventType: "messages_update",
    instance_id: ACCOUNT,
    message: { messageid: messageId, status, messageTimestamp: 1_775_000_600 },
  };
}

export const presenceEvent = {
  EventType: "presence",
  instance_id: ACCOUNT,
  presence: { chatid: "5511987654321@s.whatsapp.net", state: "composing" },
};

export const ACCOUNT_EXTERNAL_ID = ACCOUNT;
