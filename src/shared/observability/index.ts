/**
 * Observabilidade sanitizada (F0.6 — ADR-012).
 * Interface pública: logger, captura de erros e utilitários de sanitização.
 * O provedor final de observabilidade é uma decisão pendente; nada aqui
 * conecta serviços externos.
 */
export {
  createLogger,
  logger,
  type Logger,
  type LogContext,
  type LogLevel,
  type LogSink,
  type SanitizedLogEvent,
} from "./logger";
export { createErrorCapture, errorCapture, type ErrorCapture } from "./errors";
export {
  ALLOWED_CONTEXT_KEYS,
  redactString,
  sanitizeContext,
  sanitizeError,
  sanitizeValue,
} from "./redact";
