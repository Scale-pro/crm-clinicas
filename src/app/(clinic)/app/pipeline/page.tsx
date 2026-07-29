import { LayoutList, Plus, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getContact,
  listContactOwners,
  listContacts,
  listLeadSources,
  listOpportunityBoard,
} from "@/modules/crm";
import { resolveActiveClinicContext } from "@/modules/tenancy";
import { requirePermission } from "@/shared/auth";
import { formatBrlFromCents } from "@/shared/lib/currency";
import { formatClinicDateTime } from "@/shared/lib/date";
import { ActionsMenu, actionsMenuItemClassName } from "@/shared/ui/actions-menu";
import { Drawer } from "@/shared/ui/drawer";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { FeedbackBanner } from "@/shared/ui/feedback-banner";
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
import { KanbanBoard } from "./_components/kanban-board";
import { KanbanCard } from "./_components/kanban-card";
import { KanbanColumn } from "./_components/kanban-column";
import { NewOpportunityForm } from "./_components/new-opportunity-form";

type SearchParams = Promise<RouteParams>;

function paginationHref(params: RouteParams, page: number): string {
  return opportunityHref("/app/pipeline", params, { page: String(page) });
}

export default async function PipelinePage({ searchParams }: { searchParams: SearchParams }) {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") redirect("/app");
  const params = await searchParams;
  const statusValue = stringParam(params.statusFilter);
  const status = ["open", "won", "lost", "all"].includes(statusValue) ? statusValue : "open";
  const search = stringParam(params.q);
  const assignedToUserId = stringParam(params.assignee);
  const initialSourceId = stringParam(params.source);
  const page = positiveIntParam(params.page, 1, 1_000_000);
  const pageSize = positiveIntParam(params.pageSize, 40, 100);
  const contactQ = stringParam(params.contactQ);
  const duplicateWarning = params.error === "existing_open";
  const selectedContact = stringParam(params.contactId);
  const existingIdempotency = stringParam(params.idempotencyKey);
  const [board, owners, sources, contacts, selectedContactResult, createAccess, closeAccess, manageAccess] = await Promise.all([
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
    listContacts({
      clinicId: context.clinic.id,
      includeArchived: false,
      limit: contactQ ? 20 : 10,
      search: contactQ,
    }),
    selectedContact
      ? getContact({ clinicId: context.clinic.id, contactId: selectedContact })
      : Promise.resolve(null),
    requirePermission(context.clinic.id, "opportunity.create"),
    requirePermission(context.clinic.id, "opportunity.close"),
    requirePermission(context.clinic.id, "pipeline.manage"),
  ]);
  if (!board.ok) return <div className="p-4 sm:p-5"><ErrorState title="Não foi possível carregar o pipeline" description="Confira suas permissões ou tente novamente." /></div>;
  const ownerOptions = owners.ok ? owners.owners : [];
  const sourceOptions = sources.ok ? sources.leadSources.filter((source) => !source.archived_at) : [];
  const contactOptions = contacts.ok
    ? contacts.contacts.map((contact) => ({ id: contact.id, full_name: contact.full_name }))
    : [];
  if (selectedContactResult?.ok
    && !contactOptions.some((contact) => contact.id === selectedContactResult.contact.id)) {
    contactOptions.unshift({
      id: selectedContactResult.contact.id,
      full_name: selectedContactResult.contact.full_name,
    });
  }
  const openStages = board.stages.filter((stage) => stage.stage_kind === "open");
  const stageNames = new Map(board.stages.map((stage) => [stage.id, stage.name]));
  const stageAccents = new Map(board.stages.map((stage, index) => [stage.id, stageAccent(stage.stage_kind, index)]));
  const rows: LeadRow[] = board.cards.map((card) => ({
    amountCents: card.amount_cents,
    amountLabel: formatBrlFromCents(card.amount_cents),
    assigneeName: card.assigneeName,
    contactName: card.contactName,
    href: `/app/opportunities/${card.id}`,
    id: card.id,
    pipelineName: board.pipeline.name,
    sourceName: card.sourceName,
    stageAccent: stageAccents.get(card.stage_id) ?? stageAccent("open"),
    stageName: stageNames.get(card.stage_id) ?? "Etapa",
    status: card.status,
    title: card.title,
    updatedLabel: formatClinicDateTime(card.updated_at, context.clinic.timezone),
  }));
  const versions = new Map(board.cards.map((card) => [card.id, card.version]));
  const stageOf = new Map(board.cards.map((card) => [card.id, card.stage_id]));
  const rowsByStage = new Map(openStages.map((stage) => [
    stage.id,
    rows.filter((row) => row.status === "open" && stageOf.get(row.id) === stage.id),
  ]));
  const preservedFilters = {
    assignee: assignedToUserId,
    page: String(page),
    pageSize: String(pageSize),
    q: search,
    source: initialSourceId,
    statusFilter: status,
  };

  return <div className="flex min-h-0 flex-1 flex-col">
    <PageToolbar
      actions={<>
        {createAccess.allowed ? <Drawer
          defaultOpen={duplicateWarning || Boolean(contactQ) || params.new === "1"}
          description="Reutiliza a busca de contatos e as validações já existentes."
          title="Nova oportunidade"
          triggerIcon={<Plus aria-hidden="true" />}
          triggerLabel="Nova oportunidade"
          triggerProps={{ size: "sm" }}
        >
          <NewOpportunityForm
            clinicId={context.clinic.id}
            contactOptions={contactOptions}
            contactQuery={contactQ}
            duplicateWarning={duplicateWarning}
            idempotencyKey={existingIdempotency || crypto.randomUUID()}
            preservedFilters={preservedFilters}
            selectedContactId={selectedContact}
            sourceOptions={sourceOptions}
          />
        </Drawer> : null}
        <ActionsMenu label="Ações do pipeline">
          {manageAccess.allowed ? <Link className={actionsMenuItemClassName} href="/app/settings/pipeline">
            <SlidersHorizontal aria-hidden="true" />
            Configurar etapas
          </Link> : null}
          <Link className={actionsMenuItemClassName} href={opportunityHref("/app/leads", params)}>
            <LayoutList aria-hidden="true" />
            Ver como lista
          </Link>
          <RefreshButton />
        </ActionsMenu>
      </>}
      description={`Escopo: ${board.scope === "all" ? "toda a clínica" : "somente suas oportunidades"}.`}
      filters={<OpportunityFilters
        assignedToUserId={assignedToUserId}
        basePath="/app/pipeline"
        defaultStatus="open"
        idPrefix="pipeline"
        initialSourceId={initialSourceId}
        owners={ownerOptions.map((owner) => ({ id: owner.userId, label: owner.fullName }))}
        pageSize={pageSize}
        search={search}
        sources={sourceOptions.map((source) => ({ id: source.id, label: source.name }))}
        status={status}
      />}
      meta={<>
        <ToolbarMetric label="Oportunidades" value={rows.length} />
        <ToolbarMetric label="Soma visível" value={formatBrlFromCents(sumAmountCents(rows)) ?? "—"} />
      </>}
      title={board.pipeline.name}
      view={<StatusBadge tone="accent">{status === "open" ? "Kanban" : "Lista"}</StatusBadge>}
    />

    {params.error && !duplicateWarning ? <div className="px-4 pt-3 sm:px-5"><FeedbackBanner tone="error">Não foi possível concluir a ação. Revise os dados ou recarregue a página.</FeedbackBanner></div> : null}
    {duplicateWarning ? <div className="px-4 pt-3 sm:px-5"><FeedbackBanner tone="warning">Já existe uma oportunidade aberta para este contato. Abra “Nova oportunidade” e confirme explicitamente para continuar.</FeedbackBanner></div> : null}
    {params.status ? <div className="px-4 pt-3 sm:px-5"><FeedbackBanner tone="success">Alteração concluída.</FeedbackBanner></div> : null}

    {status === "open"
      ? openStages.length
        ? <KanbanBoard label={`Quadro Kanban do pipeline ${board.pipeline.name}`}>
          {openStages.map((stage, index) => {
            const stageRows = rowsByStage.get(stage.id) ?? [];
            return <KanbanColumn
              accent={stageAccents.get(stage.id) ?? stageAccent("open", index)}
              count={stageRows.length}
              headingId={`stage-${stage.id}`}
              key={stage.id}
              name={stage.name}
              totalLabel={formatBrlFromCents(sumAmountCents(stageRows)) ?? "Sem valores"}
            >
              {stageRows.map((row) => <KanbanCard
                card={row}
                clinicId={context.clinic.id}
                closeAllowed={closeAccess.allowed}
                key={row.id}
                moveTargets={openStages.filter((candidate) => candidate.id !== stage.id)}
                version={versions.get(row.id) ?? 1}
              />)}
              {stageRows.length === 0
                ? <p className="rounded-md border border-dashed border-border px-2 py-4 text-center text-xs text-muted-foreground" role="status">Nenhuma oportunidade nesta etapa.</p>
                : null}
            </KanbanColumn>;
          })}
        </KanbanBoard>
        : <div className="p-4 sm:p-5"><EmptyState title="Nenhuma etapa aberta configurada" description="Configure as etapas do pipeline para começar a organizar as oportunidades." /></div>
      : <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
        {rows.length
          ? <OpportunityTable label={`Oportunidades do pipeline ${board.pipeline.name}`} rows={rows} />
          : <EmptyState title="Nenhuma oportunidade encontrada" description="Ajuste os filtros para consultar outras oportunidades." />}
      </div>}

    <PaginationBar
      hasMore={board.hasMore}
      nextHref={paginationHref(params, page + 1)}
      page={page}
      previousHref={paginationHref(params, page - 1)}
      scopeLabel={board.scope === "all" ? "toda a clínica" : "somente suas oportunidades"}
    />
  </div>;
}
