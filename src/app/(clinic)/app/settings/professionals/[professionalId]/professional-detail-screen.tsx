"use client";

import { Archive, Pencil, Power } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";

import {
  archiveProfessionalAction,
  setProfessionalStatusAction,
  updateProfessionalAction,
} from "../../../_operations/actions";
import {
  OperationsNoticeBanner,
  useOperationsAction,
} from "../../../_operations/operations-feedback";
import { PROFESSIONALS_PATH } from "../../../_operations/operations-routes";
import type { ProfessionalFormValues } from "../../../_operations/operations-validation";
import type {
  ProfessionalDetailView,
  ProfessionalProcedureView,
} from "../../../_operations/operations-view-models";
import { ProfessionalDetail } from "../../../_operations/professional-detail";
import { ProfessionalForm, type TeamMemberOption } from "../../../_operations/professional-form";

/**
 * Detalhe do profissional conectado ao backend.
 *
 * Tudo que a tela mostra veio resolvido do servidor. As três ações — editar,
 * alternar situação e arquivar — carregam a versão que estava em tela, para que
 * uma alteração feita por outra pessoa no meio do caminho seja recusada em vez
 * de sobrescrita em silêncio.
 */
export function ProfessionalDetailScreen({
  professional,
  procedures,
  formValues,
  expectedVersion,
  teamMembers,
  timezoneLabel,
  canManage,
  archived,
}: {
  professional: ProfessionalDetailView;
  procedures: readonly ProfessionalProcedureView[];
  formValues: ProfessionalFormValues;
  expectedVersion: number;
  teamMembers: readonly TeamMemberOption[];
  timezoneLabel: string;
  canManage: boolean;
  archived: boolean;
}) {
  const router = useRouter();
  const detailPath = `${PROFESSIONALS_PATH}/${professional.id}`;
  const { notice, pending, run } = useOperationsAction(detailPath);
  const [editing, setEditing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  async function save(values: ProfessionalFormValues) {
    setSubmitError(null);
    const result = await run(
      () => updateProfessionalAction({
        availability: values.availability,
        colorToken: values.colorToken,
        displayName: values.displayName,
        email: values.email,
        expectedVersion,
        linkedUserId: values.linkedUserId,
        notes: values.notes,
        phone: values.phone,
        professionalId: professional.id,
        registrationNumber: values.registrationNumber,
        registrationType: values.registrationType,
        specialties: values.specialties,
        status: values.status,
      }),
      "Alterações salvas.",
    );
    if (result.ok) setEditing(false); else setSubmitError(result.message);
  }

  async function toggleStatus() {
    const next = professional.status === "active" ? "inactive" : "active";
    await run(
      () => setProfessionalStatusAction({ expectedVersion, id: professional.id, status: next }),
      next === "active" ? "Profissional ativado." : "Profissional desativado.",
    );
  }

  async function archive() {
    setConfirmingArchive(false);
    const result = await run(
      () => archiveProfessionalAction({ id: professional.id }),
      "Profissional arquivado.",
    );
    if (result.ok) router.push(PROFESSIONALS_PATH);
  }

  const actions = canManage && !archived ? <>
    <Button disabled={pending} onClick={() => setEditing(true)} size="sm" type="button" variant="outline">
      <Pencil aria-hidden="true" />
      Editar
    </Button>
    <Button disabled={pending} onClick={toggleStatus} size="sm" type="button" variant="outline">
      <Power aria-hidden="true" />
      {professional.status === "active" ? "Desativar" : "Ativar"}
    </Button>
    <Button disabled={pending} onClick={() => setConfirmingArchive(true)} size="sm" type="button" variant="outline">
      <Archive aria-hidden="true" />
      Arquivar
    </Button>
  </> : undefined;

  return <div className="space-y-3">
    <OperationsNoticeBanner notice={notice} />
    {archived
      ? <p className="rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm text-muted-foreground" role="status">
        Este profissional está arquivado. O cadastro fica disponível para consulta, mas não aceita mais alterações.
      </p>
      : null}

    <ProfessionalDetail actions={actions} procedures={procedures} professional={professional} />

    {canManage && !archived ? <ProfessionalForm
      initialValues={formValues}
      mode="edit"
      onClose={() => setEditing(false)}
      onSubmit={save}
      open={editing}
      submitError={submitError}
      submitting={pending}
      teamMembers={teamMembers}
      timezoneLabel={timezoneLabel}
    /> : null}

    <ConfirmDialog
      cancelLabel="Manter cadastro"
      confirmLabel="Arquivar profissional"
      description={`${professional.displayName} deixa de receber novos agendamentos e as habilitações em procedimentos são encerradas. O histórico do cadastro permanece.`}
      onCancel={() => setConfirmingArchive(false)}
      onConfirm={archive}
      open={confirmingArchive}
      title="Arquivar este profissional?"
      tone="destructive"
    />
  </div>;
}
