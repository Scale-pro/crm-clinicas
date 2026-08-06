import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * Cartão numérico compacto. O valor é sempre texto legível: quando o dado não
 * existe, a interface mostra "—" e explica o motivo em `hint`, nunca um zero
 * inventado. `srValue` permite dar ao leitor de tela uma leitura completa
 * quando a versão visual é abreviada.
 */
export function MetricCard({ label, value, srValue, detail, hint, icon, tone = "neutral" }: {
  label: string;
  value: string;
  srValue?: string;
  detail?: ReactNode;
  hint?: ReactNode;
  /**
   * Ícone opcional numa caixa tingida pelo tom, à esquerda do rótulo. É
   * decoração: fica fora da árvore de acessibilidade, porque o rótulo já diz
   * o que o número é (ADR-011).
   */
  icon?: ReactNode;
  tone?: "neutral" | "accent" | "success" | "danger" | "warning";
}) {
  const accents = {
    neutral: "text-foreground",
    accent: "text-accent-strong",
    success: "text-success-strong",
    danger: "text-destructive",
    warning: "text-warning-strong",
  } as const;

  const iconBoxes = {
    neutral: "bg-muted text-muted-foreground",
    accent: "bg-accent/10 text-accent-strong",
    success: "bg-success/10 text-success-strong",
    danger: "bg-destructive/10 text-destructive",
    warning: "bg-warning-surface text-warning-strong",
  } as const;

  return <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface p-3">
    <dt className="flex min-w-0 items-center gap-2 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
      {icon ? <span
        aria-hidden="true"
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-md [&_svg]:size-4",
          iconBoxes[tone],
        )}
      >
        {icon}
      </span> : null}
      <span className="min-w-0 truncate">{label}</span>
    </dt>
    <dd className="min-w-0">
      <span className={cn("block break-words text-2xl font-semibold leading-tight tabular-nums", accents[tone])}>
        {srValue ? <>
          <span aria-hidden="true">{value}</span>
          <span className="sr-only">{srValue}</span>
        </> : value}
      </span>
      {detail ? <span className="mt-0.5 block text-sm text-muted-foreground">{detail}</span> : null}
      {hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </dd>
  </div>;
}

/** Grade dos indicadores. `dl` mantém a relação rótulo/valor explícita. */
export function MetricGrid({ children, label }: { children?: ReactNode; label: string }) {
  return <dl aria-label={label} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {children}
  </dl>;
}
