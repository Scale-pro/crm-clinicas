"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/button";

import { createProcedureAction } from "../../_operations/actions";
import {
  OperationsNoticeBanner,
  useOperationsAction,
} from "../../_operations/operations-feedback";
import { PROCEDURES_PATH } from "../../_operations/operations-routes";
import type { ProcedureFormValues } from "../../_operations/operations-validation";
import type { ProcedureSummaryView } from "../../_operations/operations-view-models";
import { ProcedureForm } from "../../_operations/procedure-form";
import { ProcedureList } from "../../_operations/procedure-list";

/**
 * Listagem de procedimentos conectada ao backend.
 *
 * Duração padrão e preço-base são gravados aqui como padrão da clínica; a
 * personalização por profissional acontece no detalhe do procedimento. Preço
 * zero é um valor legítimo e chega ao servidor como zero, não como ausência.
 */
export function ProceduresScreen({
  rows,
  totalCount,
  hasFilters,
  canManage,
  categories,
}: {
  rows: readonly ProcedureSummaryView[];
  totalCount: number;
  hasFilters: boolean;
  canManage: boolean;
  categories: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const { notice, pending, run } = useOperationsAction(PROCEDURES_PATH);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function submit(values: ProcedureFormValues) {
    setSubmitError(null);
    if (values.durationMinutes === null || values.basePriceCents === null) {
      setSubmitError("Informe a duração padrão e o preço-base antes de salvar.");
      return;
    }
    const result = await run(
      () => createProcedureAction({
        basePriceCents: values.basePriceCents,
        category: values.category,
        colorToken: values.colorToken,
        description: values.description,
        durationMinutes: values.durationMinutes,
        name: values.name,
        status: values.status,
      }),
      "Procedimento cadastrado.",
    );
    if (result.ok) setOpen(false); else setSubmitError(result.message);
  }

  const createButton = <Button onClick={() => setOpen(true)} size="sm" type="button">
    <Plus aria-hidden="true" />
    Novo procedimento
  </Button>;

  return <div className="space-y-3">
    <OperationsNoticeBanner notice={notice} />

    <ProcedureList
      canCreate={canManage}
      createSlot={createButton}
      emptyAction={createButton}
      hasFilters={hasFilters}
      rows={rows}
      totalCount={totalCount}
    />

    {canManage ? <ProcedureForm
      categories={categories}
      mode="create"
      onClose={() => setOpen(false)}
      onSubmit={submit}
      open={open}
      submitError={submitError}
      submitting={pending}
    /> : null}
  </div>;
}
