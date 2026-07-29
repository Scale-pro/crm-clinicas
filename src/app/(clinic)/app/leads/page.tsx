import { KanbanSquare } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listContactOwners, listLeadSources, listOpportunityBoard } from "@/modules/crm";
import { resolveActiveClinicContext } from "@/modules/tenancy";
import { formatBrlFromCents } from "@/shared/lib/currency";
import { formatClinicDateTime } from "@/shared/lib/date";
import { ActionsMenu, actionsMenuItemClassName } from "@/shared/ui/actions-menu";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { PageToolbar, ToolbarMetric } from "@/shared/ui/page-toolbar";
import { stageAccent } from "@/shared/ui/stage-accent";
import { StatusBadge } from "@/shared/ui/status-badge";

import { OpportunityFilters } from "../_components/opportunity-filters";
import { OpportunityTable } from "../_components/opportunity-table";
import { sumAmountCents, type LeadRow } from "../_components/opportunity-view";
import { PaginationBar } from "../_components/pagination-bar";
import { RefreshButton } from "../_components/refresh-button";
import {
  opportunityHref,
  positiveIntParam,
  stringParam,
  type RouteParams,
} from "../_components/search-params";

type SearchParams = Promise<RouteParams>;

function paginationHref(params: RouteParams, page: number): string {
  return opportunityHref("/app/leads", params, { page: String(page) });
}

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") redirect("/app");
  const params = await searchParams;
  const statusValue = stringParam(params.statusFilter);
  const status = ["open", "won", "lost", "all"].includes(statusValue) ? statusValue : "all";
  const search = stringParam(params.q);
  const assignedToUserId = stringParam(params.assignee);
  const initialSourceId = stringParam(params.source);
  const page = positiveIntParam(params.page, 1, 1_000_000);
  const pageSize = positiveIntParam(params.pageSize, 50, 100);
  const [board, owners, sources] = await Promise.all([
    listOpportunityBoard({
      assignedToUserId: assignedToUserId || null,
      clinicId: context.clinic.id,
      initialSourceId: initialSourceId || null,
      page,
      pageSize,
      search,
      status,
    }),
    listContactOwners(context.clinic.id),
    listLeadSources(context.clinic.id),
  ]);
  if (!board.ok) {
    return <div className="p-4 sm:p-5">
      <ErrorState title="Não foi possível carregar os leads" description="Confira suas permissões ou tente novamente em alguns instantes." />
    </div>;
  }
  const ownerOptions = owners.ok ? owners.owners : [];
  const sourceOptions = sources.ok ? sources.leadSources.filter((source) => !source.archived_at) : [];
  const stageNames = new Map(board.stages.map((stage) => [stage.id, stage.name]));
  const stageAccents = new Map(board.stages.map((stage, index) => [stage.id, stageAccent(stage.stage_kind, index)]));
  const rows: LeadRow[] = board.cards.map((card) => ({
    amountCents: card.amount_cents,
    amountLabel: formatBrlFromCents(card.amount_cents),
    assigneeName: card.assigneeName,
    contactName: card.contactName,
    href: `/app/opportunities/${card.id}`,
    id: card.id,
    // Apenas o pipeline padrão é exposto hoje; a coluna já está preparada.
    pipelineName: board.pipeline.name,
    sourceName: card.sourceName,
    stageAccent: stageAccents.get(card.stage_id) ?? stageAccent("open"),
    stageName: stageNames.get(card.stage_id) ?? "Etapa",
    status: card.status,
    title: card.title,
    updatedLabel: formatClinicDateTime(card.updated_at, context.clinic.timezone),
  }));

  return <div className="flex min-h-0 flex-1 flex-col">
    <PageToolbar
      actions={<ActionsMenu label="Ações da lista">
        <Link className={actionsMenuItemClassName} href={opportunityHref("/app/pipeline", params)}>
          <KanbanSquare aria-hidden="true" />
          Ver como Kanban
        </Link>
        <RefreshButton />
      </ActionsMenu>}
      description={`Escopo: ${board.scope === "all" ? "toda a clínica" : "somente suas oportunidades"}.`}
      filters={<OpportunityFilters
        assignedToUserId={assignedToUserId}
        basePath="/app/leads"
        defaultStatus="all"
        idPrefix="leads"
        initialSourceId={initialSourceId}
        owners={ownerOptions.map((owner) => ({ id: owner.userId, label: owner.fullName }))}
        pageSize={pageSize}
        search={search}
        sources={sourceOptions.map((source) => ({ id: source.id, label: source.name }))}
        status={status}
      />}
      meta={<>
        <ToolbarMetric label="Nesta página" value={rows.length} />
        <ToolbarMetric label="Soma visível" value={formatBrlFromCents(sumAmountCents(rows)) ?? "—"} />
      </>}
      title="Todos os leads"
      view={<StatusBadge tone="accent">Lista</StatusBadge>}
    />

    <div className="scroll-slim min-h-0 flex-1 overflow-auto p-4 sm:p-5">
      {rows.length
        ? <OpportunityTable label="Oportunidades acessíveis" rows={rows} />
        : search || assignedToUserId || initialSourceId || status !== "all"
          ? <EmptyState title="Nenhum resultado para estes filtros" description="Ajuste a pesquisa ou limpe os filtros para ver mais oportunidades." />
          : <EmptyState title="Nenhuma oportunidade ainda" description="As oportunidades criadas no pipeline aparecem aqui automaticamente." />}
    </div>

    <PaginationBar
      hasMore={board.hasMore}
      nextHref={paginationHref(params, page + 1)}
      page={page}
      previousHref={paginationHref(params, page - 1)}
      scopeLabel={board.scope === "all" ? "toda a clínica" : "somente suas oportunidades"}
    />
  </div>;
}
