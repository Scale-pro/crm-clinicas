import { formatBrlFromCents } from "@/shared/lib/currency";
import { formatPercent } from "@/shared/lib/percent";
import {
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
} from "@/shared/ui/data-table";
import { EmptyState } from "@/shared/ui/empty-state";

import type { PerformanceRow } from "./dashboard-view-model";

/**
 * Tabela densa de desempenho comparado. As colunas separam o que é estoque
 * atual (em aberto) do que foi encerrado dentro do período, para que nenhuma
 * taxa seja lida com uma base diferente da que foi usada no cálculo.
 */
export function PerformanceTable({ rows, headingId, title, description, entityLabel, caption, emptyTitle, emptyDescription, showPeriodResults }: {
  rows: readonly PerformanceRow[];
  headingId: string;
  title: string;
  description: string;
  entityLabel: string;
  caption: string;
  emptyTitle: string;
  emptyDescription: string;
  /** Colunas do período só aparecem com o histórico de encerradas completo. */
  showPeriodResults: boolean;
}) {
  return <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4">
    <div>
      <h2 className="text-sm font-semibold tracking-tight" id={headingId}>{title}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {showPeriodResults
          ? description
          : "Somente as oportunidades em aberto: o resultado do período não pôde ser apurado com o conjunto atual de dados."}
      </p>
    </div>

    {rows.length === 0
      ? <EmptyState description={emptyDescription} title={emptyTitle} />
      : <DataTable label={title}>
        <caption className="sr-only">{caption}</caption>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>{entityLabel}</DataTableHeaderCell>
            <DataTableHeaderCell className="text-right">Em aberto</DataTableHeaderCell>
            {showPeriodResults ? <>
              <DataTableHeaderCell className="text-right">Ganhas</DataTableHeaderCell>
              <DataTableHeaderCell className="text-right">Perdidas</DataTableHeaderCell>
              <DataTableHeaderCell className="text-right">Valor ganho</DataTableHeaderCell>
              <DataTableHeaderCell className="text-right">Conversão</DataTableHeaderCell>
            </> : null}
          </tr>
        </DataTableHead>
        <tbody>
          {rows.map((row) => <tr className="border-t border-border" key={row.key}>
            <DataTableHeaderCell className="max-w-[14rem] truncate font-medium" scope="row">
              {row.label}
            </DataTableHeaderCell>
            <DataTableCell className="text-right tabular-nums">{row.openCount}</DataTableCell>
            {showPeriodResults ? <>
              <DataTableCell className="text-right tabular-nums">{row.wonCount}</DataTableCell>
              <DataTableCell className="text-right tabular-nums">{row.lostCount}</DataTableCell>
              <DataTableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                {formatBrlFromCents(row.wonAmountCents) ?? "—"}
              </DataTableCell>
              <DataTableCell className="text-right tabular-nums">
                {formatPercent(row.conversion) ?? "—"}
              </DataTableCell>
            </> : null}
          </tr>)}
        </tbody>
      </DataTable>}
  </section>;
}
