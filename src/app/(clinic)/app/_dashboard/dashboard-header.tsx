import { ListChecks } from "lucide-react";
import Link from "next/link";

import { ActionsMenu, actionsMenuItemClassName } from "@/shared/ui/actions-menu";
import { PageToolbar, ToolbarMetric } from "@/shared/ui/page-toolbar";
import { StatusBadge } from "@/shared/ui/status-badge";

import { RefreshButton } from "../_components/refresh-button";
import { DashboardPeriodFilter } from "./dashboard-period-filter";
import { periodOption, type PeriodKey } from "./dashboard-view-model";

/**
 * Cabeçalho compacto da visão geral: clínica ativa, pipeline em contexto,
 * período, momento da última leitura e a ação de atualizar. Nenhum
 * identificador técnico é exposto ao usuário.
 */
export function DashboardHeader({ clinicName, pipelineName, period, updatedAtLabel, scopeLabel }: {
  clinicName: string;
  pipelineName: string | null;
  period: PeriodKey;
  updatedAtLabel: string;
  scopeLabel: string;
}) {
  return <PageToolbar
    actions={<ActionsMenu label="Ações da visão geral">
      <RefreshButton />
      <Link className={actionsMenuItemClassName} href="/app/leads">
        <ListChecks aria-hidden="true" />
        Ver todos os leads
      </Link>
    </ActionsMenu>}
    description={`${clinicName} · ${scopeLabel}`}
    filters={<DashboardPeriodFilter period={period} />}
    meta={<>
      <ToolbarMetric label="Período" value={periodOption(period).longLabel} />
      <ToolbarMetric label="Atualizado em" value={updatedAtLabel} />
    </>}
    title="Visão geral"
    view={<StatusBadge tone="accent">
      {pipelineName ? `Pipeline padrão · ${pipelineName}` : "Pipeline padrão"}
    </StatusBadge>}
  />;
}
