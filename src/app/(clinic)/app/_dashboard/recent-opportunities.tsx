import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/shared/ui/empty-state";

import { OpportunityTable } from "../_components/opportunity-table";
import type { LeadRow } from "../_components/opportunity-view";

/**
 * Últimas oportunidades movimentadas. Reaproveita a tabela densa já usada em
 * "Todos os leads": mesma navegação por teclado, mesmos cartões no mobile e
 * mesma leitura das colunas.
 */
export function RecentOpportunities({ rows, headingId, limit }: {
  rows: readonly LeadRow[];
  headingId: string;
  limit: number;
}) {
  return <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight" id={headingId}>Oportunidades recentes</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          As {limit} atualizadas mais recentemente dentro do seu escopo de acesso.
        </p>
      </div>
      <Link
        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        href="/app/leads"
      >
        Ver todos os leads
        <ArrowRight aria-hidden="true" className="size-3.5" />
      </Link>
    </div>
    {rows.length === 0
      ? <EmptyState
        description="As oportunidades criadas no pipeline aparecem aqui automaticamente."
        title="Ainda não há oportunidades nesta pipeline."
      />
      : <OpportunityTable label="Oportunidades atualizadas recentemente" rows={rows} />}
  </section>;
}
