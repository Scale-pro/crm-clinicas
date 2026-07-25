import {
  capEventSize,
  redactString,
  sanitizeContext,
  sanitizeError,
} from "./redact";

/**
 * Logger sanitizado (F0.6 — ADR-012, CLAUDE.md).
 *
 * - Toda saída passa pela sanitização central ANTES de chegar a qualquer sink.
 * - O provedor final de observabilidade é uma decisão pendente: sinks são a
 *   interface desacoplada — o provedor futuro implementa LogSink/ErrorSink
 *   sem tocar nos chamadores.
 * - Este módulo é o ÚNICO autorizado a usar console (regra de lint).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Contexto estruturado — apenas chaves da allowlist sobrevivem (redact.ts). */
export type LogContext = Record<string, unknown>;

export interface SanitizedLogEvent {
  readonly level: LogLevel;
  readonly msg: string;
  readonly time: string;
  readonly context: Record<string, unknown>;
  readonly error?: unknown;
}

/** Destino de logs. Implementações reais (provedor pendente) chegam depois. */
export interface LogSink {
  write(event: SanitizedLogEvent): void;
}

export interface Logger {
  debug(msg: string, context?: LogContext): void;
  info(msg: string, context?: LogContext): void;
  warn(msg: string, context?: LogContext): void;
  error(msg: string, context?: LogContext & { error?: unknown }): void;
}

const consoleSink: LogSink = {
  write(event) {
    const line = JSON.stringify(event);
    if (event.level === "error") console.error(line);
    else if (event.level === "warn") console.warn(line);
    else console.log(line);
  },
};

export interface LoggerOptions {
  sink?: LogSink;
  /** Stack traces só fora de produção, salvo decisão explícita. */
  includeStack?: boolean;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const sink = options.sink ?? consoleSink;
  const includeStack = options.includeStack ?? process.env.NODE_ENV !== "production";

  function emit(level: LogLevel, msg: string, context?: LogContext): void {
    const { error, ...rest } = (context ?? {}) as LogContext & { error?: unknown };
    const event: Record<string, unknown> = {
      level,
      msg: redactString(msg),
      time: new Date().toISOString(),
      context: sanitizeContext(rest),
    };
    if (error !== undefined) {
      event.error = sanitizeError(error, 0, undefined, includeStack);
    }
    sink.write(capEventSize(event) as unknown as SanitizedLogEvent);
  }

  return {
    debug: (msg, context) => emit("debug", msg, context),
    info: (msg, context) => emit("info", msg, context),
    warn: (msg, context) => emit("warn", msg, context),
    error: (msg, context) => emit("error", msg, context),
  };
}

/** Logger padrão da aplicação (sink de console sanitizado — dev/F0). */
export const logger: Logger = createLogger();
