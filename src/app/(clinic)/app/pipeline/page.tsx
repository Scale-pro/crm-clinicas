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
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { Input } from "@/shared/ui/input";
import { SubmitButton } from "@/shared/ui/submit-button";

import {
  closeOpportunityFormAction,
  createOpportunityFormAction,
  moveOpportunityFormAction,
} from "./actions";
import { StageManager } from "./stage-manager";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function stringParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function positiveIntParam(
  value: string | string[] | undefined,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number(stringParam(value));
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback;
}

function paginationHref(params: Record<string, string | string[] | undefined>, page: number): string {
  const query = new URLSearchParams();
  for (const key of ["q", "assignee", "source", "statusFilter", "contactQ", "contactId", "idempotencyKey", "pageSize"]) {
    const value = stringParam(params[key]);
    if (value) query.set(key, value);
  }
  query.set("page", String(page));
  return `/app/pipeline?${query.toString()}`;
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
  if (!board.ok) return <ErrorState title="Não foi possível carregar o pipeline" description="Confira suas permissões ou tente novamente." />;
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
  const cardsByStage = new Map(openStages.map((stage) => [stage.id, board.cards.filter((card) => card.status === "open" && card.stage_id === stage.id)]));

  return <section className="space-y-6">
    <div><h1 className="text-2xl font-semibold">{board.pipeline.name}</h1><p className="text-sm text-muted-foreground">Oportunidades do pipeline padrão, no seu escopo autorizado.</p></div>
    {params.error && !duplicateWarning ? <p className="rounded-md border border-destructive/30 p-3 text-sm text-destructive" role="alert">Não foi possível concluir a ação. Revise os dados ou recarregue a página.</p> : null}
    {params.status ? <p className="rounded-md border bg-muted p-3 text-sm" role="status">Alteração concluída.</p> : null}

    <form className="grid gap-3 rounded-lg border bg-background p-4 md:grid-cols-4" method="get">
      <label className="text-sm" htmlFor="pipeline-q">Buscar
        <Input defaultValue={search} id="pipeline-q" name="q" placeholder="Contato ou título" />
      </label>
      <label className="text-sm" htmlFor="pipeline-assignee">Responsável
        <select className="h-9 w-full rounded-md border bg-background px-3" defaultValue={assignedToUserId} id="pipeline-assignee" name="assignee"><option value="">Todos permitidos</option>{ownerOptions.map((owner) => <option key={owner.userId} value={owner.userId}>{owner.fullName}</option>)}</select>
      </label>
      <label className="text-sm" htmlFor="pipeline-source">Origem
        <select className="h-9 w-full rounded-md border bg-background px-3" defaultValue={initialSourceId} id="pipeline-source" name="source"><option value="">Todas</option>{sourceOptions.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select>
      </label>
      <label className="text-sm" htmlFor="pipeline-status">Estado
        <select className="h-9 w-full rounded-md border bg-background px-3" defaultValue={status} id="pipeline-status" name="statusFilter"><option value="open">Abertas</option><option value="won">Ganhas</option><option value="lost">Perdidas</option><option value="all">Todas</option></select>
      </label>
      <input name="pageSize" type="hidden" value={pageSize} />
      <div className="md:col-span-4"><Button type="submit">Aplicar filtros</Button></div>
    </form>

    {createAccess.allowed ? <details className="rounded-lg border bg-background p-4" open={duplicateWarning || Boolean(contactQ)}>
      <summary className="cursor-pointer font-semibold">Criar oportunidade</summary>
      {duplicateWarning ? <div className="mt-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm" role="alert"><strong>Já existe uma oportunidade aberta para este contato.</strong> Se deseja criar outra, preencha novamente os dados e marque a confirmação explícita.</div> : null}
      <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
        <input name="q" type="hidden" value={search} />
        <input name="assignee" type="hidden" value={assignedToUserId} />
        <input name="source" type="hidden" value={initialSourceId} />
        <input name="statusFilter" type="hidden" value={status} />
        <input name="page" type="hidden" value={page} />
        <input name="pageSize" type="hidden" value={pageSize} />
        {selectedContact ? <input name="contactId" type="hidden" value={selectedContact} /> : null}
        {existingIdempotency ? <input name="idempotencyKey" type="hidden" value={existingIdempotency} /> : null}
        <label className="min-w-[16rem] flex-1 text-sm" htmlFor="contact-search">Buscar contato
          <Input defaultValue={contactQ} id="contact-search" maxLength={160} name="contactQ" placeholder="Nome, telefone ou e-mail" />
        </label>
        <Button type="submit" variant="outline">Pesquisar contato</Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">{contactQ ? `Resultados para “${contactQ}”.` : "Mostrando poucos contatos recentes; pesquise para localizar contatos antigos."}</p>
      <form action={createOpportunityFormAction} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input name="clinicId" type="hidden" value={context.clinic.id} />
        <input name="idempotencyKey" type="hidden" value={existingIdempotency || crypto.randomUUID()} />
        <label className="text-sm" htmlFor="opportunity-contact">Contato
          <select className="h-9 w-full rounded-md border bg-background px-3" defaultValue={selectedContact} id="opportunity-contact" name="contactId" required><option disabled value="">Selecione</option>{contactOptions.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name}</option>)}</select>
        </label>
        <label className="text-sm" htmlFor="opportunity-title">Título
          <Input id="opportunity-title" maxLength={160} minLength={2} name="title" required />
        </label>
        <label className="text-sm" htmlFor="opportunity-amount">Valor em reais
          <Input id="opportunity-amount" inputMode="decimal" name="amount" placeholder="0,00" />
        </label>
        <label className="text-sm" htmlFor="opportunity-source">Origem
          <select className="h-9 w-full rounded-md border bg-background px-3" id="opportunity-source" name="initialSourceId"><option value="">Sem origem</option>{sourceOptions.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select>
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input name="confirmedExistingOpen" type="checkbox" /> Confirmo que desejo criar outra oportunidade aberta se já existir uma para este contato.</label>
        <div className="sm:col-span-2"><SubmitButton pendingLabel="Criando…">Criar oportunidade</SubmitButton></div>
      </form>
    </details> : null}

    {status === "open" ? <div aria-label="Quadro Kanban" className="flex snap-x gap-4 overflow-x-auto pb-3" role="region">
      {openStages.map((stage) => <section aria-labelledby={`stage-${stage.id}`} className="w-[min(85vw,19rem)] shrink-0 snap-start rounded-lg border bg-muted/30 p-3" key={stage.id}>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold" id={`stage-${stage.id}`}>{stage.name}</h2><span className="rounded-full bg-background px-2 py-1 text-xs">{cardsByStage.get(stage.id)?.length ?? 0}</span></div>
        <div className="space-y-3">{cardsByStage.get(stage.id)?.map((card) => <article className="space-y-3 rounded-lg border bg-background p-3 shadow-sm focus-within:ring-2" key={card.id}>
          <div><Link className="font-semibold underline-offset-4 hover:underline focus-visible:outline-2" href={`/app/opportunities/${card.id}`}>{card.title}</Link><p className="text-sm text-muted-foreground">{card.contactName}</p></div>
          <dl className="grid gap-1 text-xs"><div><dt className="inline font-medium">Responsável: </dt><dd className="inline">{card.assigneeName}</dd></div>{card.sourceName ? <div><dt className="inline font-medium">Origem: </dt><dd className="inline">{card.sourceName}</dd></div> : null}{card.amount_cents !== null ? <div><dt className="inline font-medium">Valor: </dt><dd className="inline">{formatBrlFromCents(card.amount_cents)}</dd></div> : null}</dl>
          <form action={moveOpportunityFormAction} className="space-y-2">
            <input name="clinicId" type="hidden" value={context.clinic.id} /><input name="opportunityId" type="hidden" value={card.id} /><input name="expectedVersion" type="hidden" value={card.version} /><input name="returnTo" type="hidden" value="pipeline" />
            <label className="block text-xs" htmlFor={`move-${card.id}`}>Mover para etapa
              <select className="mt-1 h-9 w-full rounded-md border bg-background px-2" defaultValue="" id={`move-${card.id}`} name="targetStageId" required><option disabled value="">Selecione</option>{openStages.filter((candidate) => candidate.id !== stage.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select>
            </label>
            <SubmitButton pendingLabel="Movendo…" size="sm" variant="outline">Mover</SubmitButton>
          </form>
          {closeAccess.allowed ? <div className="flex flex-wrap gap-2"><form action={closeOpportunityFormAction}><input name="clinicId" type="hidden" value={context.clinic.id} /><input name="opportunityId" type="hidden" value={card.id} /><input name="expectedVersion" type="hidden" value={card.version} /><input name="targetStatus" type="hidden" value="won" /><input name="returnTo" type="hidden" value="pipeline" /><SubmitButton pendingLabel="Fechando…" size="sm">Ganhar</SubmitButton></form><details><summary className="cursor-pointer text-xs font-medium text-destructive">Perder</summary><form action={closeOpportunityFormAction} className="mt-2 space-y-2"><input name="clinicId" type="hidden" value={context.clinic.id} /><input name="opportunityId" type="hidden" value={card.id} /><input name="expectedVersion" type="hidden" value={card.version} /><input name="targetStatus" type="hidden" value="lost" /><input name="returnTo" type="hidden" value="pipeline" /><label className="block text-xs" htmlFor={`lost-${card.id}`}>Motivo da perda<Input id={`lost-${card.id}`} maxLength={500} minLength={2} name="closeReason" required /></label><SubmitButton pendingLabel="Fechando…" size="sm" variant="destructive">Confirmar perda</SubmitButton></form></details></div> : null}
        </article>)}{!cardsByStage.get(stage.id)?.length ? <EmptyState className="bg-background" title="Nenhuma oportunidade" /> : null}</div>
      </section>)}
    </div> : board.cards.length ? <div className="overflow-x-auto rounded-lg border bg-background"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Oportunidade</th><th className="p-3">Contato</th><th className="p-3">Estado</th><th className="p-3">Responsável</th><th className="p-3">Valor</th></tr></thead><tbody>{board.cards.map((card) => <tr className="border-b last:border-0" key={card.id}><td className="p-3"><Link className="font-medium underline" href={`/app/opportunities/${card.id}`}>{card.title}</Link></td><td className="p-3">{card.contactName}</td><td className="p-3">{card.status === "won" ? "Ganha" : card.status === "lost" ? "Perdida" : "Aberta"}</td><td className="p-3">{card.assigneeName}</td><td className="p-3">{formatBrlFromCents(card.amount_cents) ?? "—"}</td></tr>)}</tbody></table></div> : <EmptyState title="Nenhuma oportunidade encontrada" description="Ajuste os filtros para consultar outras oportunidades." />}

    <nav aria-label="Paginação das oportunidades" className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3">
      {page > 1
        ? <Button asChild variant="outline"><Link href={paginationHref(params, page - 1)}>Anterior</Link></Button>
        : <Button disabled variant="outline">Anterior</Button>}
      <p className="text-sm text-muted-foreground" role="status">Página {page}{board.hasMore ? " — há mais resultados" : " — última página"}</p>
      {board.hasMore
        ? <Button asChild variant="outline"><Link href={paginationHref(params, page + 1)}>Próxima</Link></Button>
        : <Button disabled variant="outline">Próxima</Button>}
    </nav>

    {manageAccess.allowed ? <StageManager clinicId={context.clinic.id} initialStages={board.stages} /> : null}
    <p className="text-xs text-muted-foreground" role="status">Cards ordenados por etapa, posição e identificador. Escopo: {board.scope === "all" ? "toda a clínica" : "somente suas oportunidades"}.</p>
  </section>;
}
