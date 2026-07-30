import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { formatBrlFromCents } from "@/shared/lib/currency";
import { formatPercent } from "@/shared/lib/percent";
import { EmptyState } from "@/shared/ui/empty-state";
import { StatusBadge } from "@/shared/ui/status-badge";

import {
  staleLabel,
  type AttentionItem,
  type AttentionReason,
  type StageBreakdownRow,
} from "./dashboard-view-model";

const reasonLabels: Record<AttentionReason, string> = {
  stale: "Parada",
  unassigned: "Sem responsável",
};

/**
 * Gargalos da operação comercial: oportunidades abertas sem responsável ou
 * sem movimentação, e etapas que concentram a fila. Cada item é um link real
 * para a oportunidade — não há botão dentro de link.
 */
export function AttentionPanel({ items, crowded, headingId }: {
  items: readonly AttentionItem[];
  crowded: readonly StageBreakdownRow[];
  headingId: string;
}) {
  return <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight" id={headingId}>Precisam de atenção</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Oportunidades abertas sem responsável ou sem movimentação recente.
        </p>
      </div>
      <Link
        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        href="/app/leads?statusFilter=open"
      >
        Ver todos os leads
        <ArrowRight aria-hidden="true" className="size-3.5" />
      </Link>
    </div>

    {items.length === 0
      ? <EmptyState
        description="Nenhuma oportunidade aberta está sem responsável ou sem movimentação."
        title="Nada exigindo atenção agora."
      />
      : <ul className="flex min-w-0 flex-col gap-2">
        {items.map((item) => <li className="min-w-0" key={item.id}>
          <Link
            className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-surface-subtle px-3 py-2 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            href={item.href}
          >
            <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="truncate text-sm font-medium">{item.title}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {formatBrlFromCents(item.amountCents) ?? "Sem valor"}
              </span>
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {item.contactName} · {item.assigneeName} · {staleLabel(item.daysSinceUpdate)}
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              {item.reasons.map((reason) => <StatusBadge
                key={reason}
                tone={reason === "unassigned" ? "warning" : "danger"}
              >
                {reasonLabels[reason]}
              </StatusBadge>)}
            </span>
          </Link>
        </li>)}
      </ul>}

    {crowded.length > 0 ? <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2">
      <h3 className="text-xs font-semibold text-warning-strong">Concentração por etapa</h3>
      <ul className="mt-1 flex flex-col gap-0.5">
        {crowded.map((stage) => <li className="text-xs text-foreground" key={stage.stageId}>
          <strong className="font-medium">{stage.name}</strong> concentra {formatPercent(stage.share) ?? "—"}
          {" "}das oportunidades abertas ({stage.count}).
        </li>)}
      </ul>
    </div> : null}
  </section>;
}
