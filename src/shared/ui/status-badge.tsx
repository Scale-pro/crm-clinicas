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
export function StatusBadge({ tone = "neutral", children, className, accent, dot, wrap, variant = "pill" }: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
  accent?: string;
  /**
   * Deixa o rótulo quebrar linha em vez de ser cortado por reticências. Para
   * caixas estreitas onde o texto do status é a informação — cortar "Em
   * atendimento" em "Em atend…" custa mais que uma segunda linha.
   */
  wrap?: boolean;
  /**
   * Ponto na cor do tom, antes do rótulo da pílula. Reforço visual do estado
   * em telas densas — nunca substitui o texto, que continua ao lado.
   * Excludente com `accent`, que pinta o ponto com uma cor arbitrária (a do
   * profissional, por exemplo) em vez da cor do tom.
   */
  dot?: boolean;
  /**
   * `inline` troca a pílula por ponto + rótulo, para caixas apertadas onde a
   * pílula não cabe. O rótulo continua presente: o ponto nunca comunica o
   * status sozinho (ADR-011).
   */
  variant?: "pill" | "inline";
}) {
  const fit = wrap ? "break-words" : "truncate";

  if (variant === "inline") {
    return <span className={cn(
      "inline-flex max-w-full items-center gap-1 text-[0.6875rem] font-medium leading-4 text-muted-foreground",
      fit,
      className,
    )}>
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", dots[tone])} />
      <span className={fit}>{children}</span>
    </span>;
  }

  return <span className={cn(
    "inline-flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs font-medium leading-4",
    fit,
    tones[tone],
    className,
  )}>
    {accent
      ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
      : dot ? <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", dots[tone])} /> : null}
    <span className={fit}>{children}</span>
  </span>;
}
