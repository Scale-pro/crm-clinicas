import Link from "next/link";

import { cn } from "@/shared/lib/utils";

import { dashboardHref, PERIOD_OPTIONS, type PeriodKey } from "./dashboard-view-model";

/**
 * Filtro de período por query string. São links reais: a URL continua
 * compartilhável, funciona sem JavaScript e é navegável pelo teclado. Nenhum
 * estado é guardado no navegador.
 */
export function DashboardPeriodFilter({ period }: { period: PeriodKey }) {
  return <nav aria-label="Período dos indicadores" className="flex min-w-0 flex-wrap items-center gap-2">
    <span className="text-xs font-medium text-muted-foreground" id="dashboard-period-label">Período</span>
    <ul aria-labelledby="dashboard-period-label" className="flex flex-wrap items-center gap-1">
      {PERIOD_OPTIONS.map((option) => {
        const selected = option.key === period;
        return <li key={option.key}>
          <Link
            aria-current={selected ? "true" : undefined}
            className={cn(
              "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              selected
                ? "border-accent/40 bg-accent/10 text-accent-strong"
                : "border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            href={dashboardHref(option.key)}
          >
            {selected ? <span className="sr-only">Período selecionado: </span> : null}
            {option.longLabel}
          </Link>
        </li>;
      })}
    </ul>
  </nav>;
}
