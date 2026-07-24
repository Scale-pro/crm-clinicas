import { describe, expect, it } from "vitest";

import {
  createErrorCapture,
  createLogger,
  redactString,
  sanitizeContext,
  sanitizeValue,
  type SanitizedLogEvent,
} from "./index";

function collectSink() {
  const events: SanitizedLogEvent[] = [];
  return {
    events,
    sink: { write: (event: SanitizedLogEvent) => void events.push(event) },
  };
}

describe("sanitização de contexto (allowlist)", () => {
  it("preserva os campos técnicos permitidos", () => {
    const ctx = sanitizeContext({
      clinic_id: "0b6f4a1e-9d1c-4c8e-9f27-3f6a2b1c9d10",
      event_id: "evt_123",
      request_id: "req_9",
      connection_id: "conn_1",
      provider: "whatsapp_cloud",
      status: "processed",
      error_code: "E_TIMEOUT",
    });
    expect(ctx.clinic_id).toBe("0b6f4a1e-9d1c-4c8e-9f27-3f6a2b1c9d10");
    expect(ctx.provider).toBe("whatsapp_cloud");
    expect(ctx.status).toBe("processed");
    expect(ctx.error_code).toBe("E_TIMEOUT");
  });

  it("redige PII mesmo quando enviada por engano no contexto", () => {
    const ctx = sanitizeContext({
      nome: "Maria da Silva",
      telefone: "+5511987654321",
      email: "maria@exemplo.com",
      clinic_id: "abc",
    });
    expect(ctx.nome).toBe("[REDACTED]");
    expect(ctx.telefone).toBe("[REDACTED]");
    expect(ctx.email).toBe("[REDACTED]");
    expect(ctx.clinic_id).toBe("abc");
  });

  it("redige raw_payload e estruturas não escalares", () => {
    const ctx = sanitizeContext({
      raw_payload: { from: "+5511999999999", body: "oi, tenho diabetes" },
      status: { nested: true },
    });
    expect(ctx.raw_payload).toBe("[REDACTED]");
    expect(ctx.status).toBe("[REDACTED]");
  });
});

describe("redação de strings", () => {
  it("redige e-mail, telefone, JWT, bearer e query de URL", () => {
    const out = redactString(
      "user maria@exemplo.com tel +55 11 98765-4321 jwt eyJabc123.eyJdef456.sig789xyz " +
        "Bearer sk_live_abcdef https://files.exemplo.com/doc.pdf?X-Signature=abc123",
    );
    expect(out).not.toContain("maria@exemplo.com");
    expect(out).not.toContain("98765");
    expect(out).not.toContain("eyJabc123");
    expect(out).not.toContain("sk_live_abcdef");
    expect(out).not.toContain("X-Signature=abc123");
    expect(out).toContain("[REDACTED_EMAIL]");
    expect(out).toContain("[REDACTED_PHONE]");
    expect(out).toContain("[REDACTED_QUERY]");
  });

  it("preserva UUIDs (identificadores técnicos) e redige tokens longos", () => {
    const uuid = "0b6f4a1e-9d1c-4c8e-9f27-3f6a2b1c9d10";
    const token = "a".repeat(48);
    const out = redactString(`id ${uuid} secret ${token}`);
    expect(out).toContain(uuid);
    expect(out).not.toContain(token);
  });
});

describe("sanitização estrutural", () => {
  it("sanitiza objetos aninhados e arrays, redigindo chaves proibidas", () => {
    const out = sanitizeValue({
      lista: [{ password: "x", ok: "sim" }],
      headers: { authorization: "Bearer abc", cookie: "sid=1", accept: "json" },
    }) as Record<string, unknown>;
    const lista = out.lista as Array<Record<string, unknown>>;
    expect(lista[0]?.password).toBe("[REDACTED]");
    expect(lista[0]?.ok).toBe("sim");
    const headers = out.headers as Record<string, unknown>;
    expect(headers.authorization).toBe("[REDACTED]");
    expect(headers.cookie).toBe("[REDACTED]");
    expect(headers.accept).toBe("json");
  });

  it("limita profundidade excessiva", () => {
    const deep = { a: { b: { c: { d: { e: { f: "fundo" } } } } } };
    const out = JSON.stringify(sanitizeValue(deep));
    expect(out).toContain("REDACTED_DEPTH");
    expect(out).not.toContain("fundo");
  });

  it("não é derrubado por referências circulares", () => {
    const circular: Record<string, unknown> = { status: "ok" };
    circular.self = circular;
    const out = sanitizeValue(circular) as Record<string, unknown>;
    expect(out.self).toBe("[CIRCULAR]");
  });

  it("redige Map sem vazar chaves/valores sensíveis", () => {
    const map = new Map<string, string>([["telefone", "+5511987654321"]]);
    const out = sanitizeValue({ dados: map }) as Record<string, unknown>;
    expect(out.dados).toBe("[REDACTED_MAP]");
    expect(JSON.stringify(out)).not.toContain("987654321");
  });

  it("redige Set sem vazar itens sensíveis", () => {
    const set = new Set(["maria@exemplo.com"]);
    const out = sanitizeValue({ dados: set }) as Record<string, unknown>;
    expect(out.dados).toBe("[REDACTED_SET]");
    expect(JSON.stringify(out)).not.toContain("maria@exemplo.com");
  });

  it("redige Buffer sem vazar bytes", () => {
    const buf = Buffer.from("token=eyJabc.def.ghi", "utf8");
    const out = sanitizeValue({ dados: buf }) as Record<string, unknown>;
    expect(out.dados).toBe("[REDACTED_BINARY]");
    expect(JSON.stringify(out)).not.toContain("eyJabc");
  });

  it("redige TypedArray/ArrayBuffer sem vazar conteúdo", () => {
    const typed = new Uint8Array([104, 105]); // "hi"
    const out = sanitizeValue({ a: typed, b: typed.buffer }) as Record<string, unknown>;
    expect(out.a).toBe("[REDACTED_BINARY]");
    expect(out.b).toBe("[REDACTED_BINARY]");
  });

  it("não altera o objeto original", () => {
    const original = { telefone: "+5511987654321", nested: { password: "abc" } };
    sanitizeValue(original);
    sanitizeContext(original);
    expect(original.telefone).toBe("+5511987654321");
    expect(original.nested.password).toBe("abc");
  });
});

describe("logger sanitizado", () => {
  it("emite evento com contexto permitido e mensagem redigida", () => {
    const { events, sink } = collectSink();
    const log = createLogger({ sink });
    log.info("evento de maria@exemplo.com processado", {
      event_id: "evt_1",
      corpo_da_mensagem: "oi, quero botox",
    });
    const event = events[0]!;
    expect(event.msg).toContain("[REDACTED_EMAIL]");
    expect(event.context.event_id).toBe("evt_1");
    expect(event.context.corpo_da_mensagem).toBe("[REDACTED]");
  });

  it("sanitiza Error com causa e redige a mensagem", () => {
    const { events, sink } = collectSink();
    const log = createLogger({ sink, includeStack: true });
    const cause = new Error("token eyJaaa111.eyJbbb222.ccc333xyz vazou");
    const error = new Error("falha ao processar +5511987654321", { cause });
    log.error("erro no processamento", { event_id: "evt_2", error });
    const sanitized = events[0]!.error as {
      message: string;
      cause?: { message: string };
    };
    expect(sanitized.message).toContain("[REDACTED_PHONE]");
    expect(sanitized.message).not.toContain("987654321");
    expect(sanitized.cause?.message).toContain("[REDACTED_TOKEN]");
  });

  it("em produção não inclui stack trace", () => {
    const { events, sink } = collectSink();
    const log = createLogger({ sink, includeStack: false });
    log.error("erro", { error: new Error("boom") });
    const sanitized = events[0]!.error as { stack?: string };
    expect(sanitized.stack).toBeUndefined();
  });

  it("trunca eventos acima do tamanho máximo", () => {
    const { events, sink } = collectSink();
    const log = createLogger({ sink });
    log.info("x".repeat(100), { error_code: "E".repeat(60_000) });
    const event = events[0] as unknown as Record<string, unknown>;
    expect(JSON.stringify(event).length).toBeLessThan(20_000);
  });
});

describe("captura de erros", () => {
  it("encaminha erros já sanitizados ao logger", () => {
    const { events, sink } = collectSink();
    const capture = createErrorCapture(createLogger({ sink }));
    capture.capture(new Error("Authorization: Bearer abc.def.ghi"), {
      request_id: "req_1",
      cookie: "sid=abc",
    });
    const event = events[0]!;
    expect(event.context.request_id).toBe("req_1");
    expect(event.context.cookie).toBe("[REDACTED]");
    const sanitized = event.error as { message: string };
    expect(sanitized.message).not.toContain("abc.def.ghi");
  });
});
