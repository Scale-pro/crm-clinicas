"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/button";

import { createProfessionalAction } from "../../_operations/actions";
import {
  OperationsNoticeBanner,
  useOperationsAction,
} from "../../_operations/operations-feedback";
import { PROFESSIONALS_PATH } from "../../_operations/operations-routes";
import type { ProfessionalFormValues } from "../../_operations/operations-validation";
import type { ProfessionalSummaryView } from "../../_operations/operations-view-models";
import { ProfessionalForm, type TeamMemberOption } from "../../_operations/professional-form";
import { ProfessionalList } from "../../_operations/professional-list";

/**
 * Listagem de profissionais conectada ao backend.
 *
 * A tela recebe as linhas já carregadas e filtradas no servidor; aqui só vivem
 * a abertura do painel de cadastro e o resultado da Server Action. A permissão
 * chega resolvida por prop e serve apenas para esconder o que não adianta
 * mostrar — quem autoriza de verdade é o servidor, a cada chamada.
 */
export function ProfessionalsScreen({
  rows,
  totalCount,
  hasFilters,
  canManage,
  teamMembers,
  timezoneLabel,
}: {
  rows: readonly ProfessionalSummaryView[];
  totalCount: number;
  hasFilters: boolean;
  canManage: boolean;
  teamMembers: readonly TeamMemberOption[];
  timezoneLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const { notice, pending, run } = useOperationsAction(PROFESSIONALS_PATH);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function submit(values: ProfessionalFormValues) {
    setSubmitError(null);
    const result = await run(
      () => createProfessionalAction({
        availability: values.availability,
        colorToken: values.colorToken,
        displayName: values.displayName,
        email: values.email,
        linkedUserId: values.linkedUserId,
        notes: values.notes,
        phone: values.phone,
        registrationNumber: values.registrationNumber,
        registrationType: values.registrationType,
        specialties: values.specialties,
        status: values.status,
      }),
      "Profissional cadastrado.",
    );
    if (result.ok) setOpen(false); else setSubmitError(result.message);
  }

  const createButton = <Button onClick={() => setOpen(true)} size="sm" type="button">
    <Plus aria-hidden="true" />
    Novo profissional
  </Button>;

  return <div className="space-y-3">
    <OperationsNoticeBanner notice={notice} />

    <ProfessionalList
      canCreate={canManage}
      createSlot={createButton}
      emptyAction={createButton}
      hasFilters={hasFilters}
      rows={rows}
      totalCount={totalCount}
    />

    {canManage ? <ProfessionalForm
      mode="create"
      onClose={() => setOpen(false)}
      onSubmit={submit}
      open={open}
      submitError={submitError}
      submitting={pending}
      teamMembers={teamMembers}
      timezoneLabel={timezoneLabel}
    /> : null}
  </div>;
}
