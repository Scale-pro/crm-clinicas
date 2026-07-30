import { cn } from "@/shared/lib/utils";

import { Skeleton } from "./skeleton";

/**
 * Esqueleto de tabela densa. Reserva a altura aproximada das linhas reais para
 * evitar salto de layout e anuncia o carregamento para leitores de tela.
 */
export function LoadingTable({ label = "Carregando…", rows = 6, columns = 5, className }: {
  label?: string;
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return <div
    aria-busy="true"
    className={cn("overflow-hidden rounded-lg border border-border bg-surface", className)}
    role="status"
  >
    <div className="flex gap-3 border-b border-border bg-surface-subtle px-3 py-2.5">
      {Array.from({ length: columns }, (_, column) => (
        <Skeleton className="h-3 flex-1" key={column} />
      ))}
    </div>
    {Array.from({ length: rows }, (_, row) => (
      <div className="flex items-center gap-3 border-b border-border px-3 py-3 last:border-b-0" key={row}>
        {Array.from({ length: columns }, (_, column) => (
          <Skeleton className="h-3.5 flex-1" key={column} />
        ))}
      </div>
    ))}
    <span className="sr-only">{label}</span>
  </div>;
}
