import { ArrowLeft, KanbanSquare, Plus, Star } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listPipelines } from "@/modules/crm";
import { resolveActiveClinicContext } from "@/modules/tenancy";
import { requirePermission } from "@/shared/auth";
import { formatClinicDateTime } from "@/shared/lib/date";
import { AccessDeniedState } from "@/shared/ui/access-denied-state";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { FeedbackBanner } from "@/shared/ui/feedback-banner";
import { FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { PageToolbar } from "@/shared/ui/page-toolbar";
import { StatusBadge } from "@/shared/ui/status-badge";
import { SubmitButton } from "@/shared/ui/submit-button";

import { crmErrorMessage, mfaHref, requiresMfa } from "../../_crm/crm-errors";
import {
  archivePipelineAction,
  createPipelineAction,
  createPipelineStageAction,
  renamePipelineAction,
  reorderPipelineStagesAction,
  setDefaultPipelineAction,
  updatePipelineStageAction,
} from "../../_pipelines/actions";
import { PipelineList } from "../../_pipelines/pipeline-list";
import {
  archiveBlockedReason,
  canArchivePipeline,
  stageKind,
  stageKindLabel,
  stageKindTone,
  type PipelineView,
} from "../../_pipelines/pipeline-view-models";
import { StageOrderEditor } from "../../_pipelines/stage-order-editor";

/**
 * Configuração de pipelines e etapas.
 *
 * Leitura em Server Component por `listPipelines`, que já devolve as etapas de
 * cada pipeline em uma única chamada. Tenant resolvido no servidor; a gestão
 * exige `pipeline.manage` **e** AAL2, verificados no módulo e no banco.
 *
 * Cada formulário envia somente os seus campos, então renomear não mexe na
 * ordem e ordenar não mexe em nome.
 *
 * **Operações ausentes do contrato público** (não há botão para elas):
 * desarquivar pipeline, arquivar ou remover etapa, cor de etapa, contagem de
 * oportunidades por pipeline e concorrência otimista — nenhuma RPC de pipeline
 * aceita versão esperada.
 */

const PIPELINES_PATH = "/app/settings/pipelines";

const SUCCESS_MESSAGES: Readonly<Record<string, string>> = {
  pipeline_archived: "Pipeline arquivado.",
  pipeline_created: "Pipeline criado.",
  pipeline_default_set: "Pipeline padrão atualizado.",
  pipeline_renamed: "Pipeline renomeado.",
  stage_created: "Etapa criada.",
  stage_renamed: "Etapa renomeada.",
  stages_reordered: "Ordem das etapas salva.",
};

export default async function PipelinesSettingsPage({ searchParams }: {
  searchParams: Promise<{ error?: string; pipeline?: string; status?: string }>;
}) {
  const [context, query] = await Promise.all([resolveActiveClinicContext(), searchParams]);
  if (context.status !== "ready") redirect("/app");
  const clinicId = context.clinic.id;

  const [result, managePermission] = await Promise.all([
    listPipelines({ clinicId, includeArchived: true }),
    requirePermission(clinicId, "pipeline.manage"),
  ]);
  const canManage = managePermission.allowed;

  const toolbar = <PageToolbar
    actions={<Button asChild size="sm" variant="outline">
      <Link href="/app/settings"><ArrowLeft aria-hidden="true" />Configurações</Link>
    </Button>}
    description="Pipelines da clínica, etapas e ordem do funil."
    title="Pipelines"
  />;

  if (!result.ok) {
    if (result.code === "forbidden" || result.code === "unauthenticated") {
      return <div className="flex min-h-0 flex-1 flex-col">
        {toolbar}
        <div className="p-4 sm:p-5">
          <AccessDeniedState
            action={<Button asChild size="sm" variant="outline"><Link href="/app/settings">Voltar às configurações</Link></Button>}
            description="Ver os pipelines exige acesso à clínica. Fale com um responsável."
          />
        </div>
      </div>;
    }
    // Falha de leitura nunca vira "nenhum pipeline cadastrado".
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        <ErrorState
          description="Tente novamente em alguns instantes. Nada foi alterado."
          title="Não foi possível carregar os pipelines"
        />
      </div>
    </div>;
  }

  const pipelines: readonly PipelineView[] = result.pipelines.map((pipeline) => ({
    archived: pipeline.archived_at !== null,
    createdAtLabel: formatClinicDateTime(pipeline.created_at, context.clinic.timezone),
    id: pipeline.id,
    isDefault: pipeline.is_default,
    name: pipeline.name,
    stages: pipeline.stages.map((stage) => ({
      id: stage.id,
      kind: stageKind(stage.stage_kind),
      name: stage.name,
      position: stage.position,
    })),
    updatedAtLabel: formatClinicDateTime(pipeline.updated_at, context.clinic.timezone),
  }));

  const selected = pipelines.find((item) => item.id === query.pipeline)
    ?? pipelines.find((item) => item.isDefault && !item.archived)
    ?? pipelines.find((item) => !item.archived)
    ?? pipelines[0]
    ?? null;

  const error = query.error ?? "";
  const banners = <>
    {query.status && SUCCESS_MESSAGES[query.status]
      ? <FeedbackBanner tone="success">{SUCCESS_MESSAGES[query.status]}</FeedbackBanner>
      : null}
    {error ? <FeedbackBanner tone={requiresMfa(error) ? "warning" : "error"}>
      {crmErrorMessage(error)}
      {requiresMfa(error) ? <>
        {" "}
        <Link className="underline underline-offset-4" href={mfaHref(PIPELINES_PATH)}>Verificar agora</Link>.
      </> : null}
    </FeedbackBanner> : null}
  </>;

  const createForm = canManage ? <form action={createPipelineAction} className="flex flex-wrap items-end gap-2">
    <FormField className="min-w-48 flex-1" id="new-pipeline-name" label="Nome do novo pipeline" required>
      <Input id="new-pipeline-name" maxLength={80} minLength={2} name="name" required />
    </FormField>
    <SubmitButton pendingLabel="Criando…" size="sm"><Plus aria-hidden="true" />Criar pipeline</SubmitButton>
  </form> : null;

  if (pipelines.length === 0) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="scroll-slim min-h-0 flex-1 space-y-3 overflow-auto p-4 sm:p-5">
        {banners}
        <EmptyState
          description="Crie o primeiro pipeline para organizar o funil da clínica."
          title="Nenhum pipeline cadastrado"
        />
        {createForm}
      </div>
    </div>;
  }

  const blockedReason = selected ? archiveBlockedReason(selected, pipelines) : null;

  return <div className="flex min-h-0 flex-1 flex-col">
    {toolbar}
    <div className="scroll-slim min-h-0 flex-1 space-y-4 overflow-auto p-4 sm:p-5">
      {banners}
      {!canManage ? <p className="rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm text-muted-foreground" role="status">
        Você pode consultar a configuração dos pipelines. Alterar exige a permissão de gestão de
        pipeline e verificação em duas etapas.
      </p> : null}

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="space-y-3">
          <PipelineList basePath={PIPELINES_PATH} pipelines={pipelines} selectedId={selected?.id ?? null} />
          {createForm}
        </div>

        {selected ? <div className="min-w-0 space-y-4">
          <section className="space-y-3 rounded-lg border border-border bg-surface p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">
                  <span className="truncate">{selected.name}</span>
                  {selected.isDefault ? <StatusBadge tone="accent">Padrão</StatusBadge> : null}
                  {selected.archived ? <StatusBadge tone="neutral">Arquivado</StatusBadge> : <StatusBadge tone="success">Ativo</StatusBadge>}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {selected.stages.length} etapa(s) · criado em {selected.createdAtLabel} · atualizado em {selected.updatedAtLabel}
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href={`/app/leads?pipelineId=${encodeURIComponent(selected.id)}`}>
                  <KanbanSquare aria-hidden="true" />
                  Ver oportunidades
                </Link>
              </Button>
            </div>

            {canManage && !selected.archived ? <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
              <form action={renamePipelineAction} className="flex flex-wrap items-end gap-2">
                <input name="pipelineId" type="hidden" value={selected.id} />
                <FormField className="min-w-40 flex-1" id="pipeline-name" label="Nome do pipeline" required>
                  <Input
                    defaultValue={selected.name}
                    id="pipeline-name"
                    maxLength={80}
                    minLength={2}
                    name="name"
                    required
                  />
                </FormField>
                <SubmitButton pendingLabel="Salvando…" size="sm" variant="outline">Salvar nome</SubmitButton>
              </form>

              <div className="flex flex-wrap items-end gap-2">
                {selected.isDefault ? null : <form action={setDefaultPipelineAction}>
                  <input name="pipelineId" type="hidden" value={selected.id} />
                  <SubmitButton pendingLabel="Definindo…" size="sm" variant="outline">
                    <Star aria-hidden="true" />
                    Definir como padrão
                  </SubmitButton>
                </form>}
                {canArchivePipeline(selected, pipelines)
                  ? <form action={archivePipelineAction}>
                    <input name="pipelineId" type="hidden" value={selected.id} />
                    <SubmitButton pendingLabel="Arquivando…" size="sm" variant="outline">Arquivar pipeline</SubmitButton>
                  </form>
                  : blockedReason
                    ? <p className="text-xs text-muted-foreground">{blockedReason}</p>
                    : null}
              </div>
            </div> : null}

            {selected.archived ? <p className="border-t border-border pt-3 text-xs text-muted-foreground">
              Pipelines arquivados ficam disponíveis para consulta. O contrato atual não oferece
              reabertura — restaurar exige uma alteração de backend.
            </p> : null}
          </section>

          <section className="space-y-3 rounded-lg border border-border bg-surface p-3">
            <div>
              <h3 className="text-sm font-semibold">Etapas</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                A ordem define as colunas do quadro. Novas etapas nascem abertas.
              </p>
            </div>

            {selected.stages.length === 0
              ? <EmptyState
                description="Crie a primeira etapa para que este pipeline possa receber oportunidades."
                title="Nenhuma etapa configurada"
              />
              : <StageOrderEditor
                action={reorderPipelineStagesAction}
                disabled={!canManage || selected.archived}
                pipelineId={selected.id}
                stages={selected.stages}
              />}

            {canManage && !selected.archived ? <div className="space-y-3 border-t border-border pt-3">
              <form action={createPipelineStageAction} className="flex flex-wrap items-end gap-2">
                <input name="pipelineId" type="hidden" value={selected.id} />
                <FormField className="min-w-48 flex-1" id="new-stage-name" label="Nova etapa (criada como aberta)" required>
                  <Input id="new-stage-name" maxLength={60} minLength={1} name="name" required />
                </FormField>
                <SubmitButton pendingLabel="Criando…" size="sm"><Plus aria-hidden="true" />Criar etapa</SubmitButton>
              </form>

              <details className="rounded-md border border-border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Renomear etapas</summary>
                <ul className="divide-y divide-border border-t border-border">
                  {selected.stages.map((stage) => <li key={stage.id}>
                    <form action={updatePipelineStageAction} className="flex flex-wrap items-end gap-2 px-3 py-2.5">
                      <input name="pipelineId" type="hidden" value={selected.id} />
                      <input name="pipelineStageId" type="hidden" value={stage.id} />
                      <FormField className="min-w-40 flex-1" id={`stage-name-${stage.id}`} label={`Nome da etapa ${stage.name}`} required>
                        <Input
                          defaultValue={stage.name}
                          id={`stage-name-${stage.id}`}
                          maxLength={60}
                          minLength={1}
                          name="name"
                          required
                        />
                      </FormField>
                      <StatusBadge className="mb-2" tone={stageKindTone(stage.kind)}>{stageKindLabel(stage.kind)}</StatusBadge>
                      <SubmitButton pendingLabel="Salvando…" size="sm" variant="outline">Salvar</SubmitButton>
                    </form>
                  </li>)}
                </ul>
              </details>

              <p className="text-xs text-muted-foreground">
                Arquivar ou remover etapa não está disponível: o contrato público não oferece essa
                operação, e a interface não simula o que o servidor não grava.
              </p>
            </div> : null}
          </section>
        </div> : null}
      </div>
    </div>
  </div>;
}
