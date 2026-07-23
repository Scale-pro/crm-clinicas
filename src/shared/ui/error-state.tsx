import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

interface ErrorStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Estado de erro genérico (fundação F0). Nunca exibir detalhes técnicos,
 * stack traces ou dados pessoais — apenas mensagens seguras para o usuário.
 */
function ErrorState({ title, description, action, className }: ErrorStateProps) {
  return (
    <section
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center",
        className,
      )}
    >
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </section>
  );
}

export { ErrorState };
