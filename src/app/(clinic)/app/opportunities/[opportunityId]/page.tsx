import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { canReopenAt, getOpportunity, listLeadSources } from "@/modules/crm";
import { resolveActiveClinicContext } from "@/modules/tenancy";
import { formatBrlFromCents } from "@/shared/lib/currency";
import { formatClinicDateTime } from "@/shared/lib/date";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { Input } from "@/shared/ui/input";
import { SubmitButton } from "@/shared/ui/submit-button";

import {
  assignOpportunityFormAction,
  closeOpportunityFormAction,
  moveOpportunityFormAction,
  reopenOpportunityFormAction,
  updateOpportunityFormAction,
} from "../../pipeline/actions";

export default async function OpportunityPage({ params, searchParams }: {
  params: Promise<{ opportunityId: string }>;
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") redirect("/app");
  const { opportunityId } = await params;
  const [result, sourceResult] = await Promise.all([
    getOpportunity({ clinicId: context.clinic.id, opportunityId }),
    listLeadSources(context.clinic.id),
  ]);
  if (!result.ok) {
    if (result.code === "not_found" || result.code === "forbidden") notFound();
    return <ErrorState title="Não foi possível carregar a oportunidade" description="Tente novamente em instantes." />;
  }
  const query = await searchParams;
  const opportunity = result.opportunity;
  const stage = result.stages.find((item) => item.id === opportunity.stage_id);
  const assignee = result.members.find((item) => item.user_id === opportunity.assigned_to_user_id);
  const stageNames = new Map(result.stages.map((item) => [item.id, item.name]));
  const openStages = result.stages.filter((item) => item.stage_kind === "open");
  const sources = sourceResult.ok
    ? sourceResult.leadSources.filter((item) => !item.archived_at || item.id === opportunity.initial_source_id)
    : [];
  const canEdit = result.permissions.edit_all || (result.permissions.edit_own && result.scope === "own");
  const canMove = result.permissions.move_all || (result.permissions.move_own && result.scope === "own");
  const canClose = result.permissions.close && (
    result.permissions.move_all || result.permissions.edit_all
    || (result.scope === "own" && (result.permissions.move_own || result.permissions.edit_own))
  );
  const canReopen = result.permissions.reopen && opportunity.closed_at
    ? canReopenAt(opportunity.closed_at)
    : false;

  return <section className="space-y-6">
    <div><Link className="text-sm underline" href="/app/pipeline">Voltar para o Kanban</Link><h1 className="mt-2 text-2xl font-semibold">{opportunity.title}</h1><p className="text-sm text-muted-foreground">{opportunity.status === "open" ? "Aberta" : opportunity.status === "won" ? "Ganha" : "Perdida"}</p></div>
    {query.status ? <p className="rounded-md border bg-muted p-3 text-sm" role="status">Alteração concluída.</p> : null}
    {query.error ? <p className="rounded-md border border-destructive/30 p-3 text-sm text-destructive" role="alert">{query.error === "conflict" ? "Esta oportunidade foi alterada em outra sessão. Recarregue antes de tentar novamente." : query.error === "mfa_required" ? "Confirme o MFA para executar esta ação." : "Não foi possível concluir a ação."}</p> : null}

    <dl className="grid gap-3 rounded-lg border bg-background p-4 sm:grid-cols-2 lg:grid-cols-3">
      <div><dt className="text-xs font-medium uppercase text-muted-foreground">Contato</dt><dd>{result.contact ? <Link className="underline" href={`/app/contacts/${result.contact.id}`}>{result.contact.full_name}</Link> : "Contato associado"}</dd></div>
      <div><dt className="text-xs font-medium uppercase text-muted-foreground">Pipeline</dt><dd>{result.pipeline?.name ?? "Pipeline"}</dd></div>
      <div><dt className="text-xs font-medium uppercase text-muted-foreground">Etapa</dt><dd>{stage?.name ?? "Etapa"}</dd></div>
      <div><dt className="text-xs font-medium uppercase text-muted-foreground">Responsável</dt><dd>{assignee?.fullName ?? "Sem responsável"}</dd></div>
      <div><dt className="text-xs font-medium uppercase text-muted-foreground">Origem</dt><dd>{result.source?.name ?? "Sem origem"}</dd></div>
      <div><dt className="text-xs font-medium uppercase text-muted-foreground">Valor</dt><dd>{formatBrlFromCents(opportunity.amount_cents) ?? "Não informado"}</dd></div>
      <div><dt className="text-xs font-medium uppercase text-muted-foreground">Criada em</dt><dd>{formatClinicDateTime(opportunity.created_at, context.clinic.timezone)}</dd></div>
      <div><dt className="text-xs font-medium uppercase text-muted-foreground">Atualizada em</dt><dd>{formatClinicDateTime(opportunity.updated_at, context.clinic.timezone)}</dd></div>
      <div><dt className="text-xs font-medium uppercase text-muted-foreground">Motivo de fechamento</dt><dd>{opportunity.close_reason ?? "—"}</dd></div>
    </dl>

    {canEdit ? <details className="rounded-lg border bg-background p-4">
      <summary className="cursor-pointer font-semibold">Editar oportunidade</summary>
      <form action={updateOpportunityFormAction} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input name="clinicId" type="hidden" value={context.clinic.id} /><input name="opportunityId" type="hidden" value={opportunity.id} /><input name="expectedVersion" type="hidden" value={opportunity.version} />
        <label className="text-sm" htmlFor="detail-title">Título<Input defaultValue={opportunity.title} id="detail-title" maxLength={160} minLength={2} name="title" required /></label>
        <label className="text-sm" htmlFor="detail-amount">Valor em reais<Input defaultValue={opportunity.amount_cents === null ? "" : (opportunity.amount_cents / 100).toFixed(2).replace(".", ",")} id="detail-amount" inputMode="decimal" name="amount" /></label>
        <label className="text-sm sm:col-span-2" htmlFor="detail-source">Origem<select className="h-9 w-full rounded-md border bg-background px-3" defaultValue={opportunity.initial_source_id ?? ""} id="detail-source" name="initialSourceId"><option value="">Sem origem</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
        <div className="sm:col-span-2"><SubmitButton pendingLabel="Atualizando…">Salvar edição</SubmitButton></div>
      </form>
    </details> : null}

    <div className="grid gap-4 lg:grid-cols-2">
      {opportunity.status === "open" && canMove ? <form action={moveOpportunityFormAction} className="space-y-3 rounded-lg border bg-background p-4">
        <h2 className="font-semibold">Mudar etapa</h2><input name="clinicId" type="hidden" value={context.clinic.id} /><input name="opportunityId" type="hidden" value={opportunity.id} /><input name="expectedVersion" type="hidden" value={opportunity.version} /><input name="returnTo" type="hidden" value="detail" />
        <label className="block text-sm" htmlFor="detail-stage">Nova etapa<select className="mt-1 h-9 w-full rounded-md border bg-background px-3" defaultValue="" id="detail-stage" name="targetStageId" required><option disabled value="">Selecione</option>{openStages.filter((item) => item.id !== opportunity.stage_id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <SubmitButton pendingLabel="Movendo…">Mover oportunidade</SubmitButton>
      </form> : null}

      {result.permissions.edit_all ? <form action={assignOpportunityFormAction} className="space-y-3 rounded-lg border bg-background p-4">
        <h2 className="font-semibold">Reatribuir responsável</h2><input name="clinicId" type="hidden" value={context.clinic.id} /><input name="opportunityId" type="hidden" value={opportunity.id} /><input name="expectedVersion" type="hidden" value={opportunity.version} />
        <label className="block text-sm" htmlFor="detail-assignee">Membro ativo<select className="mt-1 h-9 w-full rounded-md border bg-background px-3" defaultValue={opportunity.assigned_to_user_id ?? ""} id="detail-assignee" name="assignedToUserId" required><option disabled value="">Selecione</option>{result.members.map((member) => <option key={member.user_id} value={member.user_id}>{member.fullName}</option>)}</select></label>
        <SubmitButton pendingLabel="Reatribuindo…">Reatribuir</SubmitButton>
      </form> : null}
    </div>

    {opportunity.status === "open" && canClose ? <section className="space-y-3 rounded-lg border bg-background p-4"><h2 className="font-semibold">Fechar oportunidade</h2><div className="flex flex-wrap items-start gap-4"><form action={closeOpportunityFormAction}><input name="clinicId" type="hidden" value={context.clinic.id} /><input name="opportunityId" type="hidden" value={opportunity.id} /><input name="expectedVersion" type="hidden" value={opportunity.version} /><input name="targetStatus" type="hidden" value="won" /><SubmitButton pendingLabel="Fechando…">Marcar como ganha</SubmitButton></form><form action={closeOpportunityFormAction} className="flex flex-col gap-2 sm:flex-row sm:items-end"><input name="clinicId" type="hidden" value={context.clinic.id} /><input name="opportunityId" type="hidden" value={opportunity.id} /><input name="expectedVersion" type="hidden" value={opportunity.version} /><input name="targetStatus" type="hidden" value="lost" /><label className="text-sm" htmlFor="detail-lost-reason">Motivo da perda<Input id="detail-lost-reason" maxLength={500} minLength={2} name="closeReason" required /></label><SubmitButton pendingLabel="Fechando…" variant="destructive">Marcar como perdida</SubmitButton></form></div></section> : null}

    {opportunity.status !== "open" && canReopen ? <form action={reopenOpportunityFormAction} className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4"><h2 className="font-semibold">Reabrir fechamento recente</h2><p className="text-sm text-muted-foreground">Disponível por até 24 horas e somente após confirmação MFA.</p><input name="clinicId" type="hidden" value={context.clinic.id} /><input name="opportunityId" type="hidden" value={opportunity.id} /><input name="expectedVersion" type="hidden" value={opportunity.version} /><label className="block text-sm" htmlFor="reopen-stage">Etapa aberta<select className="mt-1 h-9 w-full rounded-md border bg-background px-3" id="reopen-stage" name="targetStageId" required>{openStages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="block text-sm" htmlFor="reopen-reason">Motivo da correção<Input id="reopen-reason" maxLength={500} minLength={2} name="reason" required /></label><SubmitButton pendingLabel="Reabrindo…" variant="outline">Reabrir oportunidade</SubmitButton></form> : null}

    <section className="rounded-lg border bg-background p-4"><h2 className="font-semibold">Histórico de etapas</h2>{result.events.length ? <ol className="mt-4 space-y-3">{result.events.map((event) => <li className="border-l-2 pl-3 text-sm" key={event.id}><p><strong>{event.from_stage_id ? stageNames.get(event.from_stage_id) ?? event.from_status : "Criação"}</strong> → <strong>{stageNames.get(event.to_stage_id) ?? event.to_status}</strong></p><p className="text-muted-foreground">{formatClinicDateTime(event.occurred_at, context.clinic.timezone)}{event.reason ? ` — ${event.reason}` : ""}</p></li>)}</ol> : <EmptyState className="mt-3" title="Nenhum evento de etapa" />}</section>
  </section>;
}
