import type { LogContext } from "./logger";
import { logger, type Logger } from "./logger";

/**
 * Captura de erros desacoplada (F0.6). O provedor final (Sentry, outro) é uma
 * decisão pendente — quando escolhido, implementa esta interface SEM alterar
 * os chamadores, e continua recebendo apenas dados já sanitizados.
 */
export interface ErrorCapture {
  capture(error: unknown, context?: LogContext): void;
}

/** Implementação da F0: encaminha ao logger sanitizado. */
export function createErrorCapture(target: Logger = logger): ErrorCapture {
  return {
    capture(error, context) {
      target.error("erro capturado", { ...context, error });
    },
  };
}

export const errorCapture: ErrorCapture = createErrorCapture();
