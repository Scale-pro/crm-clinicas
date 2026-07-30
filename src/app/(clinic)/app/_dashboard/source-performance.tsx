import type { PerformanceRow } from "./dashboard-view-model";
import { PerformanceTable } from "./performance-table";

/**
 * Desempenho por origem. Só aparecem as origens reais já vinculadas às
 * oportunidades; quando a origem não foi informada, o rótulo é humano
 * ("Sem origem informada") — nunca "null" nem um identificador.
 */
export function SourcePerformance({ rows, headingId, periodLabel, showPeriodResults }: {
  rows: readonly PerformanceRow[];
  headingId: string;
  periodLabel: string;
  showPeriodResults: boolean;
}) {
  return <PerformanceTable
    caption={`Oportunidades abertas por origem e resultado das encerradas nos ${periodLabel}.`}
    description={`Abertas hoje e encerramentos dos ${periodLabel}.`}
    emptyDescription="As origens aparecem aqui conforme forem vinculadas às oportunidades."
    emptyTitle="Ainda não há oportunidades para comparar por origem."
    entityLabel="Origem"
    headingId={headingId}
    rows={rows}
    showPeriodResults={showPeriodResults}
    title="Desempenho por origem"
  />;
}
