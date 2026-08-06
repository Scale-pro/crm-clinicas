"use client";

import { Archive, Pencil, Power } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";

import {
  archiveProcedureAction,
  saveProcedureProfessionalLinksAction,
  setProcedureStatusAction,
  updateProcedureAction,
} from "../../../_operations/actions";
import {
  OperationsNoticeBanner,
  useOperationsAction,
} from "../../../_operations/operations-feedback";
import { PROCEDURES_PATH } from "../../../_operations/operations-routes";
import type { ProcedureFormValues } from "../../../_operations/operations-validation";
import type {
  ProcedureDetailView,
  ProcedureProfessionalLinkView,
} from "../../../_operations/operations-view-models";
import { ProcedureDetail } from "../../../_operations/procedure-detail";
import { ProcedureForm } from "../../../_operations/procedure-form";
import { ProfessionalProcedureEditor } from "../../../_operations/professional-procedure-editor";

/** Identificador e versão do vínculo, necessários para gravar com concorrência otimista. */
export type ProcedureLinkState = {
  readonly professionalId: string;
  readonly professionalProcedureId: string | null;
  readonly version: number | null;
};

function changed(
  left: ProcedureProfessionalLinkView,
  right: ProcedureProfessionalLinkView,
): boolean {
  return left.enabled !== right.enabled
    || left.durationOverrideMinutes !== right.durationOverrideMinutes
    || left.priceOverrideCents !== right.priceOverrideCents;
}

/**
 * Detalhe do procedimento conectado ao backend.
 *
 * Além de editar o padrão da clínica (duração e preço-base), esta tela é onde
 * profissionais são habilitados e onde duração e preço podem ser personalizados
 * por profissional. Só os vínculos que realmente mudaram são enviados, cada um
 * com a versão que estava em tela.
 */
export function ProcedureDetailScreen({
  procedure,
  links,
  linkStates,
  formValues,
  expectedVersion,
  categories,
  canManage,
  archived,
}: {
  procedure: ProcedureDetailView;
  links: readonly ProcedureProfessionalLinkView[];
  linkStates: readonly ProcedureLinkState[];
  formValues: ProcedureFormValues;
  expectedVersion: number;
  categories: readonly string[];
  canManage: boolean;
  archived: boolean;
}) {
  const router = useRouter();
  const detailPath = `${PROCEDURES_PATH}/${procedure.id}`;
  const { notice, pending, run } = useOperationsAction(detailPath);
  const [editing, setEditing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [draftLinks, setDraftLinks] = useState<readonly ProcedureProfessionalLinkView[]>(links);

  // O rascunho volta a espelhar o servidor sempre que os vínculos carregados
  // mudam — depois de salvar, ou quando outra pessoa altera algo. Enquanto o
  // servidor devolve o mesmo conteúdo, a edição em andamento é preservada.
  const linksSignature = JSON.stringify(links);
  const [syncedSignature, setSyncedSignature] = useState(linksSignature);
  if (syncedSignature !== linksSignature) {
    setSyncedSignature(linksSignature);
    setDraftLinks(links);
  }

  const stateByProfessional = new Map(linkStates.map((state) => [state.professionalId, state]));
  const pendingLinks = draftLinks.filter((link) => {
    const original = links.find((item) => item.professionalId === link.professionalId);
    return original !== undefined && changed(original, link);
  });

  async function save(values: ProcedureFormValues) {
    setSubmitError(null);
    if (values.durationMinutes === null || values.basePriceCents === null) {
      setSubmitError("Informe a duração padrão e o preço-base antes de salvar.");
      return;
    }
    const result = await run(
      () => updateProcedureAction({
        basePriceCents: values.basePriceCents,
        category: values.category,
        colorToken: values.colorToken,
        description: values.description,
        durationMinutes: values.durationMinutes,
        expectedVersion,
        name: values.name,
        procedureId: procedure.id,
        status: values.status,
      }),
      "Alterações salvas.",
    );
    if (result.ok) setEditing(false); else setSubmitError(result.message);
  }

  async function toggleStatus() {
    const next = procedure.status === "active" ? "inactive" : "active";
    await run(
      () => setProcedureStatusAction({ expectedVersion, id: procedure.id, status: next }),
      next === "active" ? "Procedimento ativado." : "Procedimento desativado.",
    );
  }

  async function archive() {
    setConfirmingArchive(false);
    const result = await run(
      () => archiveProcedureAction({ id: procedure.id }),
      "Procedimento arquivado.",
    );
    if (result.ok) router.push(PROCEDURES_PATH);
  }

  async function saveLinks() {
    await run(
      () => saveProcedureProfessionalLinksAction({
        links: pendingLinks.map((link) => {
          const state = stateByProfessional.get(link.professionalId);
          return {
            durationMinutesOverride: link.durationOverrideMinutes,
            enabled: link.enabled,
            expectedVersion: state?.version ?? null,
            priceCentsOverride: link.priceOverrideCents,
            professionalId: link.professionalId,
            professionalProcedureId: state?.professionalProcedureId ?? null,
          };
        }),
        procedureId: procedure.id,
      }),
      "Habilitações atualizadas.",
    );
    // A ação revalida a rota mesmo em falha parcial: o rascunho volta a
    // espelhar exatamente o que ficou gravado, nunca um estado otimista.
  }

  const actions = canManage && !archived ? <>
    <Button disabled={pending} onClick={() => setEditing(true)} size="sm" type="button" variant="outline">
      <Pencil aria-hidden="true" />
      Editar
    </Button>
    <Button disabled={pending} onClick={toggleStatus} size="sm" type="button" variant="outline">
      <Power aria-hidden="true" />
      {procedure.status === "active" ? "Desativar" : "Ativar"}
    </Button>
    <Button disabled={pending} onClick={() => setConfirmingArchive(true)} size="sm" type="button" variant="outline">
      <Archive aria-hidden="true" />
      Arquivar
    </Button>
  </> : undefined;

  return <div className="space-y-4">
    <OperationsNoticeBanner notice={notice} />
    {archived
      ? <p className="rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm text-muted-foreground" role="status">
        Este procedimento está arquivado. O cadastro fica disponível para consulta, mas não aceita mais alterações.
      </p>
      : null}

    <ProcedureDetail actions={actions} links={links} procedure={procedure} />

    {canManage && !archived ? <section className="space-y-3 rounded-lg border border-border bg-surface p-3">
      <div>
        <h3 className="text-sm font-semibold">Habilitar profissionais</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Só profissionais ativos podem ser habilitados. Duração e preço em branco herdam o padrão do procedimento.
        </p>
      </div>
      <ProfessionalProcedureEditor
        baseDurationMinutes={procedure.durationMinutes}
        basePriceCents={procedure.basePriceCents}
        disabled={pending}
        links={draftLinks}
        onChange={setDraftLinks}
      />
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        <p className="me-auto text-xs text-muted-foreground" role="status">
          {pendingLinks.length === 0
            ? "Nenhuma alteração pendente."
            : `${pendingLinks.length} alteração(ões) pendente(s).`}
        </p>
        <Button
          disabled={pending || pendingLinks.length === 0}
          onClick={saveLinks}
          size="sm"
          type="button"
        >
          {pending ? "Salvando…" : "Salvar habilitações"}
        </Button>
      </div>
    </section> : null}

    {canManage && !archived ? <ProcedureForm
      categories={categories}
      initialValues={formValues}
      mode="edit"
      onClose={() => setEditing(false)}
      onSubmit={save}
      open={editing}
      submitError={submitError}
      submitting={pending}
    /> : null}

    <ConfirmDialog
      cancelLabel="Manter cadastro"
      confirmLabel="Arquivar procedimento"
      description={`${procedure.name} deixa de ser agendável e as habilitações de profissionais são encerradas. O histórico do cadastro permanece.`}
      onCancel={() => setConfirmingArchive(false)}
      onConfirm={archive}
      open={confirmingArchive}
      title="Arquivar este procedimento?"
      tone="destructive"
    />
  </div>;
}
