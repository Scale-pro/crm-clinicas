import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * Área do quadro: ocupa toda a altura restante da área de trabalho e rola na
 * horizontal. É focalizável para permitir rolagem por teclado.
 */
export function KanbanBoard({ label, children, className }: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return <div
    aria-label={label}
    className={cn("scroll-slim flex min-h-0 flex-1 snap-x gap-3 overflow-x-auto px-4 pb-4 pt-3 sm:px-5", className)}
    role="region"
    tabIndex={0}
  >
    {children}
  </div>;
}
