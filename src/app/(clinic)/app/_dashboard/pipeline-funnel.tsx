import { formatBrlFromCents } from "@/shared/lib/currency";
import { formatPercent } from "@/shared/lib/percent";
import { EmptyState } from "@/shared/ui/empty-state";
import { stageAccent } from "@/shared/ui/stage-accent";
import { StatusBadge } from "@/shared/ui/status-badge";

import type { StageBreakdownRow } from "./dashboard-view-model";

function stageKindLabel(stageKind: string): string | null {
  if (stageKind === "won") return "Encerramento · ganha";
  if (stageKind === "lost") return "Encerramento · perdida";
  return null;
}

/**
 * Funil da pipeline padrão. Cada etapa é uma linha de texto completa (nome,
 * quantidade, valor e percentual); a barra é apenas reforço visual e está
 * marcada como decorativa — nenhuma informação depende de cor ou de largura.
 */
export function PipelineFunnel({ rows, openCount, headingId }: {
  rows: readonly StageBreakdownRow[];
  openCount: number;
  headingId: string;
}) {
  return <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4">
    <div>
      <h2 className="text-sm font-semibold tracking-tight" id={headingId}>Funil por etapa</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Distribuição das {openCount} oportunidades abertas da pipeline padrão. O percentual é
        calculado sobre esse total.
      </p>
    </div>

    {rows.length === 0 || openCount === 0
      ? <EmptyState
        description="Assim que houver oportunidades abertas, a distribuição por etapa aparece aqui."
        title="Ainda não há oportunidades abertas nesta pipeline."
      />
      : <ol className="flex min-w-0 flex-col gap-3">
        {rows.map((row, index) => {
          const accent = stageAccent(row.stageKind, index);
          const kindLabel = stageKindLabel(row.stageKind);
          const width = row.count > 0 ? Math.max(row.share * 100, 2) : 0;
          return <li className="min-w-0" key={row.stageId}>
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{row.name}</span>
                {kindLabel ? <StatusBadge>{kindLabel}</StatusBadge> : null}
              </span>
              <span className="flex shrink-0 items-baseline gap-2 text-sm tabular-nums">
                <span className="font-semibold">{row.count}</span>
                <span className="text-muted-foreground">
                  {row.count === 1 ? "oportunidade" : "oportunidades"}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="font-medium">{formatPercent(row.share) ?? "—"}</span>
              </span>
            </div>
            <div aria-hidden="true" className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ backgroundColor: accent, width: `${width}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Valor em aberto na etapa: {formatBrlFromCents(row.amountCents) ?? "—"}
            </p>
          </li>;
        })}
      </ol>}
  </section>;
}
