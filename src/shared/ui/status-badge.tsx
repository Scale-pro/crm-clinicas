import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

const tones = {
  neutral: "border-border bg-muted text-muted-foreground",
  accent: "border-accent/35 bg-accent/10 text-accent-strong",
  success: "border-success/35 bg-success/10 text-success-strong",
  warning: "border-warning/40 bg-warning/15 text-warning-strong",
  danger: "border-destructive/35 bg-destructive/10 text-destructive",
} as const;

/** Cor do ponto na variante `inline`, onde não há pílula para tingir. */
const dots = {
  neutral: "bg-muted-foreground",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
} as const;

export type StatusTone = keyof typeof tones;

/**
 * Etiqueta compacta de estado. O texto é sempre o portador da informação —
 * a cor é apenas reforço (ADR-011: nada depende exclusivamente de cor).
 */
export function StatusBadge({ tone = "neutral", children, className, accent, variant = "pill" }: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
  accent?: string;
  /**
   * `inline` troca a pílula por ponto + rótulo, para caixas apertadas onde a
   * pílula não cabe. O rótulo continua presente: o ponto nunca comunica o
   * status sozinho (ADR-011).
   */
  variant?: "pill" | "inline";
}) {
  if (variant === "inline") {
    return <span className={cn(
      "inline-flex max-w-full items-center gap-1 truncate text-[0.6875rem] font-medium leading-4 text-muted-foreground",
      className,
    )}>
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", dots[tone])} />
      <span className="truncate">{children}</span>
    </span>;
  }

  return <span className={cn(
    "inline-flex max-w-full items-center gap-1.5 truncate rounded-md border px-1.5 py-0.5 text-xs font-medium leading-4",
    tones[tone],
    className,
  )}>
    {accent ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} /> : null}
    <span className="truncate">{children}</span>
  </span>;
}
