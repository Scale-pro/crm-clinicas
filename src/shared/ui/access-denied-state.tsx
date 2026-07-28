import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * Estado de acesso negado. É apenas UX: a autorização real acontece no
 * servidor (guard + RPC + RLS). Nunca exibe códigos internos, IDs técnicos
 * nem mensagens do banco.
 */
export function AccessDeniedState({ title = "Você não tem acesso a esta área", description, action, className }: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return <section
    aria-live="polite"
    className={cn(
      "flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface p-8 text-center",
      className,
    )}
    role="status"
  >
    <h2 className="text-sm font-medium text-foreground">{title}</h2>
    {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
    {action ? <div className="mt-2">{action}</div> : null}
  </section>;
}
