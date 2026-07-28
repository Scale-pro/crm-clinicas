import { resolveActiveClinicContext } from "@/modules/tenancy";
import { formatBrlFromCents } from "@/shared/lib/currency";
import { formatClinicDateTime } from "@/shared/lib/date";
import { formatPercent } from "@/shared/lib/percent";
import { AccessDeniedState } from "@/shared/ui/access-denied-state";
import { ErrorState } from "@/shared/ui/error-state";
import { stageAccent } from "@/shared/ui/stage-accent";

import type { LeadRow } from "./_components/opportunity-view";
import { type RouteParams } from "./_components/search-params";
import { AttentionPanel } from "./_dashboard/attention-panel";
import { loadDashboardData } from "./_dashboard/dashboard-data";
import { DashboardEmptyState, PartialDataNotice } from "./_dashboard/dashboard-empty-state";
import { DashboardHeader } from "./_dashboard/dashboard-header";
import {
  buildAttentionItems,
  buildOwnerPerformance,
  buildRecent,
  buildSourcePerformance,
  buildStageBreakdown,
  buildSummary,
  closedWithinPeriod,
  crowdedStages,
  OVERVIEW_LIST_LIMIT,
  parsePeriod,
  periodOption,
  periodRange,
  STALE_AFTER_DAYS,
} from "./_dashboard/dashboard-view-model";
import { MetricCard, MetricGrid } from "./_dashboard/metric-card";
import { OwnerPerformance } from "./_dashboard/owner-performance";
import { PipelineFunnel } from "./_dashboard/pipeline-funnel";
import { RecentOpportunities } from "./_dashboard/recent-opportunities";
import { SourcePerformance } from "./_dashboard/source-performance";

type SearchParams = Promise<RouteParams>;

/**
 * Visão geral do gestor. É um Server Component: todos os números vêm dos casos
 * de uso públicos do módulo CRM, já filtrados pelo escopo de acesso do usuário
 * no servidor. Quando o contrato não permite calcular um indicador com
 * segurança, ele aparece como "—" ou é omitido, nunca preenchido.
 */
export default async function ClinicHomePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const period = parsePeriod(params.period);
  const context = await resolveActiveClinicContext();

  if (context.status !== "ready") {
    return <div className="p-4 sm:p-5">
      <ErrorState
        description="Recarregue a página em alguns instantes para continuar."
        title="Não foi possível carregar a visão geral"
      />
    </div>;
  }

  const data = await loadDashboardData(context.clinic.id);

  if (!data.ok) {
    return <div className="p-4 sm:p-5">
      {data.code === "forbidden"
        ? <AccessDeniedState
          description="Peça a um responsável da clínica para liberar o acesso às oportunidades."
          title="Você não tem acesso aos indicadores comerciais"
        />
        : <ErrorState
          description="Os indicadores dependem das oportunidades da clínica. Tente novamente em alguns instantes."
          title="Não foi possível carregar a visão geral"
        />}
    </div>;
  }

  const now = new Date();
  const range = periodRange(period, now);
  const option = periodOption(period);
  // Métricas de encerramento só entram quando o histórico veio completo:
  // um recorte parcial produziria conversão e ticket médio enganosos.
  const closedMetricsReliable = data.closedAvailable && data.closedComplete;
  const closedInPeriod = closedMetricsReliable ? closedWithinPeriod(data.closed, range) : [];
  const summary = buildSummary({ closedInPeriod, now, open: data.open });
  const stageRows = buildStageBreakdown(data.stages, data.open);
  const funnelRows = stageRows.filter((row) => row.stageKind === "open" || row.count > 0);
  const attentionItems = buildAttentionItems(data.open, now, OVERVIEW_LIST_LIMIT);
  const ownerRows = buildOwnerPerformance(data.open, closedInPeriod);
  const sourceRows = buildSourcePerformance(data.open, closedInPeriod);

  const stageNames = new Map(data.stages.map((stage) => [stage.id, stage.name]));
  const stageAccents = new Map(
    data.stages.map((stage, index) => [stage.id, stageAccent(stage.stage_kind, index)]),
  );
  const recentRows: readonly LeadRow[] = buildRecent(
    [...data.open, ...data.closed],
    OVERVIEW_LIST_LIMIT,
  ).map((opportunity) => ({
    amountCents: opportunity.amountCents,
    amountLabel: formatBrlFromCents(opportunity.amountCents),
    assigneeName: opportunity.assigneeName,
    contactName: opportunity.contactName,
    href: `/app/opportunities/${opportunity.id}`,
    id: opportunity.id,
    // Apenas o pipeline padrão é exposto hoje; a coluna já está preparada.
    pipelineName: data.pipeline.name,
    sourceName: opportunity.sourceName,
    stageAccent: stageAccents.get(opportunity.stageId) ?? stageAccent("open"),
    stageName: stageNames.get(opportunity.stageId) ?? "Etapa",
    status: opportunity.status,
    title: opportunity.title,
    updatedLabel: formatClinicDateTime(opportunity.updatedAt, context.clinic.timezone),
  }));

  const hasAnyOpportunity = data.open.length > 0 || data.closed.length > 0;
  const periodEmpty = closedMetricsReliable && summary.closedCount === 0;

  const header = <DashboardHeader
    clinicName={context.clinic.name}
    period={period}
    pipelineName={data.pipeline.name}
    scopeLabel={data.scope === "all" ? "Toda a clínica" : "Somente suas oportunidades"}
    updatedAtLabel={formatClinicDateTime(now.toISOString(), context.clinic.timezone)}
  />;

  // Sem nenhuma oportunidade não há o que medir: indicadores zerados sem
  // contexto confundem mais do que informam.
  if (!hasAnyOpportunity) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="p-4 sm:p-5"><DashboardEmptyState /></div>
    </div>;
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    {header}

    <div className="scroll-slim flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 sm:p-5">
      {data.openComplete ? null : <PartialDataNotice>
        Há mais oportunidades abertas do que esta página consegue somar de uma vez. Os
        indicadores abaixo refletem apenas as oportunidades já carregadas.
      </PartialDataNotice>}
      {data.closedAvailable && !data.closedComplete ? <PartialDataNotice>
        O histórico de oportunidades encerradas é maior do que o conjunto carregado. Ganhas,
        perdidas, conversão e ticket médio consideram apenas o que foi carregado.
      </PartialDataNotice> : null}
      {data.closedAvailable ? null : <PartialDataNotice>
        Alguns indicadores não estão disponíveis com o conjunto atual de dados: não foi
        possível carregar as oportunidades encerradas.
      </PartialDataNotice>}

      <MetricGrid label="Indicadores do período">
        <MetricCard
          detail={summary.openCount === 1 ? "oportunidade em andamento" : "oportunidades em andamento"}
          label="Oportunidades abertas"
          tone="accent"
          value={String(summary.openCount)}
        />
        <MetricCard
          detail={summary.openWithoutAmountCount > 0
            ? `${summary.openWithoutAmountCount} sem valor informado`
            : "Soma das oportunidades abertas"}
          label="Valor em aberto"
          value={formatBrlFromCents(summary.openAmountCents) ?? "—"}
        />
        <MetricCard
          detail={closedMetricsReliable
            ? `${formatBrlFromCents(summary.wonAmountCents) ?? "—"} em ${option.longLabel.toLowerCase()}`
            : "Indisponível com o conjunto atual de dados"}
          label="Ganhas no período"
          tone="success"
          value={closedMetricsReliable ? String(summary.wonCount) : "—"}
        />
        <MetricCard
          detail={closedMetricsReliable
            ? `Encerradas em ${option.longLabel.toLowerCase()}`
            : "Indisponível com o conjunto atual de dados"}
          label="Perdidas no período"
          tone="danger"
          value={closedMetricsReliable ? String(summary.lostCount) : "—"}
        />
        <MetricCard
          detail="Ganhas sobre o total de encerradas no período"
          hint={periodEmpty ? "Nenhuma oportunidade foi encerrada neste período." : undefined}
          label="Taxa de conversão"
          value={(closedMetricsReliable ? formatPercent(summary.conversion) : null) ?? "—"}
        />
        <MetricCard
          detail="Valor médio por oportunidade ganha no período"
          label="Ticket médio ganho"
          value={(closedMetricsReliable
            ? formatBrlFromCents(summary.averageWonTicketCents)
            : null) ?? "—"}
        />
        <MetricCard
          detail={`Abertas sem atualização há ${STALE_AFTER_DAYS} dias ou mais`}
          label="Leads sem movimentação"
          tone={summary.staleCount > 0 ? "warning" : "neutral"}
          value={String(summary.staleCount)}
        />
        <MetricCard
          detail={data.closedAvailable
            ? `Ganhas e perdidas em ${option.longLabel.toLowerCase()}`
            : "Indisponível com o conjunto atual de dados"}
          label="Encerradas no período"
          value={closedMetricsReliable ? String(summary.closedCount) : "—"}
        />
      </MetricGrid>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        <PipelineFunnel headingId="dashboard-funnel" openCount={summary.openCount} rows={funnelRows} />
        <AttentionPanel
          crowded={crowdedStages(stageRows)}
          headingId="dashboard-attention"
          items={attentionItems}
        />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        <OwnerPerformance
          headingId="dashboard-owners"
          periodLabel={option.label}
          rows={ownerRows}
          showPeriodResults={closedMetricsReliable}
        />
        <SourcePerformance
          headingId="dashboard-sources"
          periodLabel={option.label}
          rows={sourceRows}
          showPeriodResults={closedMetricsReliable}
        />
      </div>

      <RecentOpportunities
        headingId="dashboard-recent"
        limit={OVERVIEW_LIST_LIMIT}
        rows={recentRows}
      />
    </div>
  </div>;
}
