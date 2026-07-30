"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/shared/ui/button";
import { ColorIndicator } from "@/shared/ui/color-indicator";
import { DurationInput } from "@/shared/ui/duration-input";
import { ErrorSummary, type ErrorSummaryEntry } from "@/shared/ui/error-summary";
import { FeedbackBanner } from "@/shared/ui/feedback-banner";
import {
  FormField,
  FormFieldset,
  fieldDescribedBy,
  formSelectClassName,
  formTextareaClassName,
} from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { MoneyInput } from "@/shared/ui/money-input";

import { FormPanel } from "./form-panel";
import { shouldResetForm, type FormResetKey } from "./form-sync";
import {
  MAX_DESCRIPTION_LENGTH,
  validateProcedureForm,
  type FieldErrors,
  type ProcedureFieldKey,
  type ProcedureFormValues,
} from "./operations-validation";
import { AGENDA_COLORS, DEFAULT_AGENDA_COLOR_TOKEN } from "./operations-view-models";

const FIELD_ORDER: readonly ProcedureFieldKey[] = [
  "name",
  "category",
  "durationMinutes",
  "basePriceCents",
  "description",
];

const FIELD_LABELS: Readonly<Record<ProcedureFieldKey, string>> = {
  basePriceCents: "Preço-base",
  category: "Categoria",
  description: "Descrição",
  durationMinutes: "Duração padrão",
  name: "Nome",
};

function initialFormValues(initial?: Partial<ProcedureFormValues>): ProcedureFormValues {
  return {
    basePriceCents: initial?.basePriceCents ?? null,
    category: initial?.category ?? "",
    colorToken: initial?.colorToken ?? DEFAULT_AGENDA_COLOR_TOKEN,
    description: initial?.description ?? "",
    durationMinutes: initial?.durationMinutes ?? null,
    name: initial?.name ?? "",
    status: initial?.status ?? "active",
  };
}

/**
 * Formulário de criação e edição de procedimento.
 *
 * Preço é exibido em BRL e trafega em centavos; duração trafega em minutos.
 * Preço zero é um valor legítimo (cortesia, avaliação) e o campo nunca aceita
 * valor negativo. Esta entrega não trata custo, imposto, insumo nem comissão.
 * A ação vem por prop — o componente não conhece Server Action, RPC nem banco.
 */
export function ProcedureForm({
  open,
  mode,
  initialValues,
  categories = [],
  submitting = false,
  submitError = null,
  onSubmit,
  onClose,
}: {
  open: boolean;
  mode: "create" | "edit";
  initialValues?: Partial<ProcedureFormValues>;
  /** Categorias já usadas na clínica, oferecidas como sugestão de digitação. */
  categories?: readonly string[];
  submitting?: boolean;
  submitError?: string | null;
  onSubmit: (values: ProcedureFormValues) => void | Promise<void>;
  onClose: () => void;
}) {
  const baseId = useId();
  const initial = useMemo(() => initialFormValues(initialValues), [initialValues]);
  const [values, setValues] = useState<ProcedureFormValues>(initial);
  const [errors, setErrors] = useState<FieldErrors<ProcedureFieldKey>>({});
  const [attempted, setAttempted] = useState(0);
  const formId = `${baseId}-procedure-form`;
  const categoryListId = `${baseId}-categories`;

  const fieldId = (key: ProcedureFieldKey | "color" | "status") => `${baseId}-${key}`;

  const dirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(initial),
    [initial, values],
  );

  // Leva o foco ao primeiro campo com erro a cada tentativa de envio.
  const [focusRequest, setFocusRequest] = useState<{ readonly fieldId: string } | null>(null);
  useEffect(() => {
    if (!focusRequest) return;
    document.getElementById(focusRequest.fieldId)?.focus();
  }, [focusRequest]);

  // Reinicia o formulário em transições reais (reabertura, troca de
  // procedimento, create/edit), preservando a digitação quando o pai apenas
  // recria `initialValues` com o mesmo conteúdo.
  const signature = JSON.stringify(initial);
  const [syncKey, setSyncKey] = useState<FormResetKey>({ mode, open, signature });
  if (syncKey.open !== open || syncKey.mode !== mode || syncKey.signature !== signature) {
    const reset = shouldResetForm(syncKey, { mode, open, signature });
    setSyncKey({ mode, open, signature });
    if (reset) {
      setValues(initial);
      setErrors({});
      setAttempted(0);
      setFocusRequest(null);
    }
  }

  function patch(next: Partial<ProcedureFormValues>) {
    setValues((current) => {
      const merged = { ...current, ...next };
      if (attempted > 0) setErrors(validateProcedureForm(merged));
      return merged;
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateProcedureForm(values);
    setErrors(nextErrors);
    setAttempted((count) => count + 1);
    const firstErrorKey = FIELD_ORDER.find((key) => nextErrors[key] !== undefined);
    if (firstErrorKey) {
      setFocusRequest({ fieldId: fieldId(firstErrorKey) });
      return;
    }
    void onSubmit(values);
  }

  const summaryEntries: readonly ErrorSummaryEntry[] = FIELD_ORDER
    .filter((key) => errors[key] !== undefined)
    .map((key) => ({ fieldId: fieldId(key), message: `${FIELD_LABELS[key]}: ${errors[key]}` }));

  const selectedColor = AGENDA_COLORS.find((color) => color.token === values.colorToken) ?? AGENDA_COLORS[0]!;

  return <FormPanel
    description="Duração e preço definidos aqui valem como padrão da clínica."
    dirty={dirty}
    footer={<>
      <Button onClick={onClose} size="sm" type="button" variant="outline">Cancelar</Button>
      <Button disabled={submitting} form={formId} size="sm" type="submit">
        {submitting ? "Salvando…" : mode === "create" ? "Cadastrar procedimento" : "Salvar alterações"}
      </Button>
    </>}
    onRequestClose={onClose}
    open={open}
    title={mode === "create" ? "Novo procedimento" : "Editar procedimento"}
  >
    <form className="space-y-5" id={formId} noValidate onSubmit={submit}>
      {submitError ? <FeedbackBanner tone="error">{submitError}</FeedbackBanner> : null}
      <ErrorSummary autoFocus={false} entries={summaryEntries} />

      <FormFieldset legend="Identificação">
        <div className="grid gap-4">
          <FormField
            error={errors.name ?? null}
            id={fieldId("name")}
            label="Nome do procedimento"
            required
          >
            <Input
              aria-describedby={fieldDescribedBy(fieldId("name"), { error: Boolean(errors.name) })}
              aria-invalid={Boolean(errors.name) || undefined}
              autoComplete="off"
              id={fieldId("name")}
              maxLength={80}
              onChange={(event) => patch({ name: event.target.value })}
              value={values.name}
            />
          </FormField>

          <FormField
            error={errors.category ?? null}
            help="Agrupa o procedimento nas listas e nos filtros."
            hint="opcional"
            id={fieldId("category")}
            label="Categoria"
          >
            <Input
              aria-describedby={fieldDescribedBy(fieldId("category"), { error: Boolean(errors.category), help: true })}
              aria-invalid={Boolean(errors.category) || undefined}
              autoComplete="off"
              id={fieldId("category")}
              list={categories.length > 0 ? categoryListId : undefined}
              maxLength={40}
              onChange={(event) => patch({ category: event.target.value })}
              value={values.category}
            />
            {categories.length > 0 ? <datalist id={categoryListId}>
              {categories.map((category) => <option key={category} value={category} />)}
            </datalist> : null}
          </FormField>
        </div>
      </FormFieldset>

      <FormFieldset
        description="Estes valores são o padrão da clínica. Preço e duração poderão ser personalizados por profissional na aba de profissionais habilitados."
        legend="Duração e preço"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            error={errors.durationMinutes ?? null}
            help="Tempo reservado na agenda, incluindo preparo."
            id={fieldId("durationMinutes")}
            label="Duração padrão"
            required
          >
            <DurationInput
              describedBy={fieldDescribedBy(fieldId("durationMinutes"), { error: Boolean(errors.durationMinutes), help: true })}
              id={fieldId("durationMinutes")}
              invalid={Boolean(errors.durationMinutes)}
              onChange={(minutes) => patch({ durationMinutes: minutes })}
              valueMinutes={values.durationMinutes}
            />
          </FormField>

          <FormField
            error={errors.basePriceCents ?? null}
            help="Use 0,00 para procedimento sem cobrança. Valores negativos não são aceitos."
            id={fieldId("basePriceCents")}
            label="Preço-base"
            required
          >
            <MoneyInput
              describedBy={fieldDescribedBy(fieldId("basePriceCents"), { error: Boolean(errors.basePriceCents), help: true })}
              id={fieldId("basePriceCents")}
              invalid={Boolean(errors.basePriceCents)}
              onChange={(cents) => patch({ basePriceCents: cents })}
              valueCents={values.basePriceCents}
            />
          </FormField>
        </div>
      </FormFieldset>

      <FormFieldset legend="Agenda e situação">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={fieldId("color")} label="Cor na agenda">
            <select
              className={formSelectClassName}
              id={fieldId("color")}
              onChange={(event) => patch({ colorToken: event.target.value })}
              value={values.colorToken}
            >
              {AGENDA_COLORS.map((color) => <option key={color.token} value={color.token}>{color.label}</option>)}
            </select>
            <ColorIndicator
              className="mt-1.5 text-muted-foreground"
              color={selectedColor.cssValue}
              label={`Cor selecionada: ${selectedColor.label}`}
            />
          </FormField>

          <FormField
            help="Procedimentos inativos não podem ser agendados."
            id={fieldId("status")}
            label="Situação"
          >
            <select
              aria-describedby={fieldDescribedBy(fieldId("status"), { help: true })}
              className={formSelectClassName}
              id={fieldId("status")}
              onChange={(event) => patch({ status: event.target.value === "inactive" ? "inactive" : "active" })}
              value={values.status}
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </FormField>
        </div>
      </FormFieldset>

      <FormField
        error={errors.description ?? null}
        help="Resumo interno do que o procedimento inclui."
        hint={`${values.description.length}/${MAX_DESCRIPTION_LENGTH}`}
        id={fieldId("description")}
        label="Descrição"
      >
        <textarea
          aria-describedby={fieldDescribedBy(fieldId("description"), { error: Boolean(errors.description), help: true })}
          aria-invalid={Boolean(errors.description) || undefined}
          className={formTextareaClassName}
          id={fieldId("description")}
          maxLength={MAX_DESCRIPTION_LENGTH}
          onChange={(event) => patch({ description: event.target.value })}
          rows={3}
          value={values.description}
        />
      </FormField>
    </form>
  </FormPanel>;
}
