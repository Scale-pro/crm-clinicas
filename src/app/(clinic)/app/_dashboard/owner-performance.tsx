import type { PerformanceRow } from "./dashboard-view-model";
import { PerformanceTable } from "./performance-table";

/**
 * Desempenho por responsável. O rótulo é sempre o nome devolvido pelo caso de
 * uso do quadro — nenhum identificador técnico chega à interface e nenhum nome
 * é inventado para quem ainda não tem responsável definido.
 */
export function OwnerPerformance({ rows, headingId, periodLabel, showPeriodResults }: {
  rows: readonly PerformanceRow[];
  headingId: string;
  periodLabel: string;
  showPeriodResults: boolean;
}) {
  return <PerformanceTable
    caption={`Oportunidades abertas por responsável e resultado das encerradas nos ${periodLabel}.`}
    description={`Abertas hoje e encerramentos dos ${periodLabel}.`}
    emptyDescription="Assim que houver oportunidades atribuídas, o comparativo aparece aqui."
    emptyTitle="Ainda não há oportunidades para comparar por responsável."
    entityLabel="Responsável"
    headingId={headingId}
    rows={rows}
    showPeriodResults={showPeriodResults}
    title="Desempenho por responsável"
  />;
}
