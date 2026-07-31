import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { canReopenAt, getOpportunity, listLeadSources } from "@/modules/crm";
import { resolveActiveClinicContext } from "@/modules/tenancy";
import { formatClinicDateTime } from "@/shared/lib/date";
import { AccessDeniedState } from "@/shared/ui/access-denied-state";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";
import { FeedbackBanner } from "@/shared/ui/feedback-banner";
import { FormField, formSelectClassName } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { PageToolbar } from "@/shared/ui/page-toolbar";
import { StatusBadge } from "@/shared/ui/status-badge";
import { SubmitButton } from "@/shared/ui/submit-button";

import {
  assignOpportunityAction,
  closeOpportunityAction,
  moveOpportunityAction,
  reopenOpportunityAction,
  updateOpportunityAction,
} from "../../_crm/actions";
import { crmErrorMessage, mfaHref, requiresMfa } from "../../_crm/crm-errors";
import {
  opportunityStatus,
  opportunityStatusLabel,
  opportunityStatusTone,
  stageEventLabel,
  type StageEventView,
} from "../../_crm/crm-view-models";
import { OpportunityHistory, OpportunitySummary } from "../../_crm/opportunity-detail";

/**
 * Detalhe da oportunidade.
 *
 * Leitura em Server Component pelo contrato `getOpportunity`, que resolve
 * escopo e permissões no servidor e já devolve contato, pipeline, etapas,
 * origem, membros ativos e o histórico de etapas.
 *
 * As gravações usam as Server Actions de `_crm/actions.ts`: o `clinicId` é
 * resolvido no servidor e **não existe** como campo de formulário. Cada ação
 * leva a versão em tela como `expectedVersion`, então uma alteração feita por
 * outra pessoa no meio do caminho é recusada em vez de sobrescrita.
 *
 * O que a interface oferece é exatamente o que os contratos suportam: editar
 * título/valor/origem, mudar de etapa, reatribuir, marcar ganho, marcar perda
 * com motivo obrigatório e reabrir em até 24 horas com MFA. Não há campo
 * apenas visual.
 */

const SUCCESS_MESSAGES: Readonly<Record<string, string>> = {
  created: "Oportunidade criada.",
  opportunity_assigned: "Responsável atualizado.",
  opportunity_lost: "Oportunidade marcada como perdida.",
  opportunity_moved: "Etapa atualizada.",
  opportunity_reopened: "Oportunidade reaberta.",
  opportunity_updated: "Oportunidade atualizada.",
  opportunity_won: "Oportunidade marcada como ganha.",
};

function Section({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return <section className="space-y-3 rounded-lg border border-border bg-surface p-3">
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
    </div>
    {children}
  </section>;
}

export default async function OpportunityDetailPage({ params, searchParams }: {
  params: Promise<{ opportunityId: string }>;
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const [context, route, query] = await Promise.all([
    resolveActiveClinicContext(),
    params,
    searchParams,
  ]);
  if (context.status !== "ready") redirect("/app");
  const clinicId = context.clinic.id;
  const { opportunityId } = route;
  const detailPath = `/app/opportunities/${encodeURIComponent(opportunityId)}`;

  const [result, sourceResult] = await Promise.all([
    getOpportunity({ clinicId, opportunityId }),
    listLeadSources(clinicId),
  ]);

  const toolbar = <PageToolbar
    actions={<Button asChild size="sm" variant="outline">
      <Link href="/app/pipeline"><ArrowLeft aria-hidden="true" />Pipeline</Link>
    </Button>}
    description="Situação, responsável, valor e histórico de movimentações."
    title="Oportunidade"
  />;

  if (!result.ok) {
    if (result.code === "not_found" || result.code === "invalid_input") notFound();
    if (result.code === "forbidden") {
      return <div className="flex min-h-0 flex-1 flex-col">
        {toolbar}
        <div className="p-4 sm:p-5">
          <AccessDeniedState
            action={<Button asChild size="sm" variant="outline"><Link href="/app">Voltar à visão geral</Link></Button>}
            description="Ver oportunidades exige permissão de visualização. Fale com um responsável da clínica."
          />
        </div>
      </div>;
    }
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        <ErrorState
          description="Tente novamente em alguns instantes."
          title="Não foi possível carregar a oportunidade"
        />
      </div>
    </div>;
  }

  const opportunity = result.opportunity;
  const status = opportunityStatus(opportunity.status);
  const stageNames = new Map(result.stages.map((item) => [item.id, item.name]));
  const openStages = result.stages.filter((item) => item.stage_kind === "open");
  const assignee = result.members.find((item) => item.user_id === opportunity.assigned_to_user_id);
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

  const events: readonly StageEventView[] = result.events.map((event) => ({
    fromLabel: stageEventLabel(event.from_stage_id, event.from_status, stageNames),
    id: event.id,
    occurredAtLabel: formatClinicDateTime(event.occurred_at, context.clinic.timezone),
    reason: event.reason,
    toLabel: stageEventLabel(event.to_stage_id, event.to_status, stageNames),
  }));

  const error = query.error ?? "";
  const identity = <>
    <input name="opportunityId" type="hidden" value={opportunity.id} />
    <input name="expectedVersion" type="hidden" value={opportunity.version} />
  </>;

  return <div className="flex min-h-0 flex-1 flex-col">
    {toolbar}
    <div className="scroll-slim min-h-0 flex-1 overflow-auto p-4 sm:p-5">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight">{opportunity.title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {result.contact?.full_name ?? "Contato não disponível"}
            </p>
          </div>
          <StatusBadge tone={opportunityStatusTone(status)}>{opportunityStatusLabel(status)}</StatusBadge>
        </div>

        {query.status && SUCCESS_MESSAGES[query.status]
          ? <FeedbackBanner tone="success">{SUCCESS_MESSAGES[query.status]}</FeedbackBanner>
          : null}
        {error ? <FeedbackBanner tone={requiresMfa(error) ? "warning" : "error"}>
          {crmErrorMessage(error)}
          {requiresMfa(error) ? <>
            {" "}
            <Link className="underline underline-offset-4" href={mfaHref(detailPath)}>Verificar agora</Link>.
          </> : null}
        </FeedbackBanner> : null}

        <OpportunitySummary opportunity={{
          amountCents: opportunity.amount_cents,
          assigneeName: assignee?.fullName ?? null,
          closeReason: opportunity.close_reason,
          closedAtLabel: opportunity.closed_at
            ? formatClinicDateTime(opportunity.closed_at, context.clinic.timezone)
            : null,
          contactHref: result.contact ? `/app/contacts/${encodeURIComponent(result.contact.id)}` : null,
          contactName: result.contact?.full_name ?? null,
          createdAtLabel: formatClinicDateTime(opportunity.created_at, context.clinic.timezone),
          id: opportunity.id,
          pipelineName: result.pipeline?.name ?? null,
          sourceName: result.source?.name ?? null,
          stageName: stageNames.get(opportunity.stage_id) ?? null,
          status,
          title: opportunity.title,
          updatedAtLabel: formatClinicDateTime(opportunity.updated_at, context.clinic.timezone),
        }} />

        {canEdit ? <Section
          description="Título, valor e origem. As mesmas validações são reaplicadas no servidor."
          title="Editar oportunidade"
        >
          <form action={updateOpportunityAction} className="grid gap-3 sm:grid-cols-2">
            {identity}
            <FormField id="opportunity-title" label="Título" required>
              <Input
                defaultValue={opportunity.title}
                id="opportunity-title"
                maxLength={160}
                minLength={2}
                name="title"
                required
              />
            </FormField>
            <FormField help="Deixe em branco para não informar valor." hint="opcional" id="opportunity-amount" label="Valor em reais">
              <Input
                defaultValue={opportunity.amount_cents === null
                  ? ""
                  : (opportunity.amount_cents / 100).toFixed(2).replace(".", ",")}
                id="opportunity-amount"
                inputMode="decimal"
                name="amount"
              />
            </FormField>
            <FormField className="sm:col-span-2" hint="opcional" id="opportunity-source" label="Origem">
              <select
                className={formSelectClassName}
                defaultValue={opportunity.initial_source_id ?? ""}
                id="opportunity-source"
                name="initialSourceId"
              >
                <option value="">Sem origem</option>
                {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
              </select>
            </FormField>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel="Salvando…" size="sm">Salvar alterações</SubmitButton>
            </div>
          </form>
        </Section> : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {status === "open" && canMove ? <Section title="Mudar etapa">
            <form action={moveOpportunityAction} className="space-y-3">
              {identity}
              <FormField id="opportunity-stage" label="Nova etapa" required>
                <select className={formSelectClassName} defaultValue="" id="opportunity-stage" name="targetStageId" required>
                  <option disabled value="">Selecione</option>
                  {openStages
                    .filter((item) => item.id !== opportunity.stage_id)
                    .map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </FormField>
              <SubmitButton pendingLabel="Movendo…" size="sm">Mover oportunidade</SubmitButton>
            </form>
          </Section> : null}

          {result.permissions.edit_all ? <Section title="Responsável">
            <form action={assignOpportunityAction} className="space-y-3">
              {identity}
              <FormField id="opportunity-assignee" label="Membro ativo da equipe" required>
                <select
                  className={formSelectClassName}
                  defaultValue={opportunity.assigned_to_user_id ?? ""}
                  id="opportunity-assignee"
                  name="assignedToUserId"
                  required
                >
                  <option disabled value="">Selecione</option>
                  {result.members.map((member) => <option key={member.user_id} value={member.user_id}>{member.fullName}</option>)}
                </select>
              </FormField>
              <SubmitButton pendingLabel="Salvando…" size="sm">Reatribuir</SubmitButton>
            </form>
          </Section> : null}
        </div>

        {status === "open" && canClose ? <Section
          description="Ganho não exige motivo. A perda exige — é o contrato do servidor, não um campo decorativo."
          title="Fechar oportunidade"
        >
          <div className="flex flex-wrap items-end gap-4">
            <form action={closeOpportunityAction}>
              {identity}
              <input name="targetStatus" type="hidden" value="won" />
              <SubmitButton pendingLabel="Fechando…" size="sm">Marcar como ganha</SubmitButton>
            </form>
            <form action={closeOpportunityAction} className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
              {identity}
              <input name="targetStatus" type="hidden" value="lost" />
              <FormField className="min-w-0 flex-1 sm:max-w-sm" id="opportunity-lost-reason" label="Motivo da perda" required>
                <Input id="opportunity-lost-reason" maxLength={500} minLength={2} name="closeReason" required />
              </FormField>
              <SubmitButton pendingLabel="Fechando…" size="sm" variant="destructive">Marcar como perdida</SubmitButton>
            </form>
          </div>
        </Section> : null}

        {status !== "open" && canReopen ? <Section
          description="Disponível por até 24 horas após o fechamento e somente com verificação em duas etapas."
          title="Reabrir oportunidade"
        >
          <form action={reopenOpportunityAction} className="grid gap-3 sm:grid-cols-2">
            {identity}
            <FormField id="opportunity-reopen-stage" label="Etapa aberta de destino" required>
              <select className={formSelectClassName} id="opportunity-reopen-stage" name="targetStageId" required>
                {openStages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </FormField>
            <FormField id="opportunity-reopen-reason" label="Motivo da correção" required>
              <Input id="opportunity-reopen-reason" maxLength={500} minLength={2} name="reason" required />
            </FormField>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel="Reabrindo…" size="sm" variant="outline">Reabrir oportunidade</SubmitButton>
            </div>
          </form>
        </Section> : null}

        <Section title="Histórico de movimentações">
          <OpportunityHistory events={events} />
        </Section>
      </div>
    </div>
  </div>;
}
