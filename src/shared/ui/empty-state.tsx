import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Estado vazio genérico (fundação F0). Sem conteúdo de domínio — telas das
 * fases seguintes fornecem título/descrição/ação específicos.
 */
function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <section
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-8 text-center",
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

export { EmptyState };
