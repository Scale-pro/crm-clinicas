import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

const tones = {
  neutral: "border-border bg-muted text-muted-foreground",
  accent: "border-accent/35 bg-accent/10 text-accent-strong",
  success: "border-success/35 bg-success/10 text-success-strong",
  warning: "border-warning/40 bg-warning/15 text-warning-strong",
  danger: "border-destructive/35 bg-destructive/10 text-destructive",
} as const;

export type StatusTone = keyof typeof tones;

/**
 * Etiqueta compacta de estado. O texto é sempre o portador da informação —
 * a cor é apenas reforço (ADR-011: nada depende exclusivamente de cor).
 */
export function StatusBadge({ tone = "neutral", children, className, accent }: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
  accent?: string;
}) {
  return <span className={cn(
    "inline-flex max-w-full items-center gap-1.5 truncate rounded-md border px-1.5 py-0.5 text-xs font-medium leading-4",
    tones[tone],
    className,
  )}>
    {accent ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} /> : null}
    <span className="truncate">{children}</span>
  </span>;
}
