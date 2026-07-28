import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * Tabela densa com cabeçalho fixo e rolagem horizontal contida — o corpo da
 * página nunca rola na horizontal. O nome acessível vem de `label`.
 */
export function DataTable({ label, children, className }: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("scroll-slim overflow-x-auto rounded-lg border border-border bg-surface", className)}>
    <table aria-label={label} className="w-full border-collapse text-left text-sm">{children}</table>
  </div>;
}

export function DataTableHead({ children }: { children: ReactNode }) {
  return <thead className="sticky top-0 z-10 bg-surface-subtle text-xs uppercase tracking-wide text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]">
    {children}
  </thead>;
}

export function DataTableHeaderCell({ children, className, scope = "col" }: {
  children: ReactNode;
  className?: string;
  scope?: "col" | "row";
}) {
  return <th className={cn("whitespace-nowrap px-3 py-2 font-medium", className)} scope={scope}>{children}</th>;
}

export function DataTableCell({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2 align-middle", className)}>{children}</td>;
}
