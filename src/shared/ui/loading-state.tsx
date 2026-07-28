import { cn } from "@/shared/lib/utils";

import { Skeleton } from "./skeleton";

/**
 * Estado de carregamento genérico. Anuncia o carregamento para leitores de
 * tela e mantém a altura aproximada do conteúdo para evitar saltos de layout.
 */
export function LoadingState({ label = "Carregando…", rows = 3, className }: {
  label?: string;
  rows?: number;
  className?: string;
}) {
  return <div aria-busy="true" aria-label={label} className={cn("space-y-3", className)} role="status">
    <Skeleton className="h-7 w-52" />
    {Array.from({ length: rows }, (_, index) => (
      <Skeleton className="h-16 w-full" key={index} />
    ))}
    <span className="sr-only">{label}</span>
  </div>;
}
