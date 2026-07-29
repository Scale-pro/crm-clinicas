import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * Barra superior compacta das telas de trabalho: título, indicadores,
 * ações principais e uma faixa opcional de filtros. Ocupa poucas linhas para
 * preservar a área útil do conteúdo.
 */
export function PageToolbar({ title, description, view, meta, actions, filters, className }: {
  title: ReactNode;
  description?: ReactNode;
  view?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  className?: string;
}) {
  return <div className={cn("sticky top-[var(--app-header-height)] z-20 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80 lg:top-0", className)}>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>
          {view}
        </div>
        {description ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-3 sm:gap-4">{meta}</div> : null}
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
    {filters ? <div className="border-t border-border bg-surface-subtle px-4 py-2 sm:px-5">{filters}</div> : null}
  </div>;
}

/** Indicador numérico compacto (contagem, soma) exibido na barra superior. */
export function ToolbarMetric({ label, value }: { label: string; value: ReactNode }) {
  return <p className="flex flex-col leading-tight">
    <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="text-sm font-semibold tabular-nums">{value}</span>
  </p>;
}
