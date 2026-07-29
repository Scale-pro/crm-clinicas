"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { formatBrPhoneDigits, phoneDigits } from "@/shared/lib/phone";
import { Button } from "@/shared/ui/button";
import { ColorIndicator } from "@/shared/ui/color-indicator";
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

import { FormPanel } from "./form-panel";
import {
  MAX_NOTES_LENGTH,
  emptyWeek,
  validateProfessionalForm,
  type FieldErrors,
  type ProfessionalFieldKey,
  type ProfessionalFormValues,
} from "./operations-validation";
import { AGENDA_COLORS, DEFAULT_AGENDA_COLOR_TOKEN } from "./operations-view-models";
import { SpecialtyEditor } from "./specialty-editor";
import { WeeklyAvailabilityEditor } from "./weekly-availability-editor";

/** Registros profissionais mais comuns em clínicas de estética, mais escape textual. */
export const REGISTRATION_TYPES: readonly string[] = [
  "CRM",
  "CRO",
  "CRBM",
  "COREN",
  "CRF",
  "CREFITO",
  "CRN",
  "Outro",
];

/** Ordem de leitura dos erros — resumo e foco inicial seguem esta sequência. */
const FIELD_ORDER: readonly ProfessionalFieldKey[] = [
  "displayName",
  "email",
  "phone",
  "registrationNumber",
  "notes",
  "availability",
];

const FIELD_LABELS: Readonly<Record<ProfessionalFieldKey, string>> = {
  availability: "Disponibilidade semanal",
  displayName: "Nome de exibição",
  email: "E-mail",
  notes: "Observações",
  phone: "Telefone",
  registrationNumber: "Número de registro",
};

export type TeamMemberOption = { readonly id: string; readonly name: string };

function initialFormValues(initial?: Partial<ProfessionalFormValues>): ProfessionalFormValues {
  return {
    availability: initial?.availability ?? emptyWeek(),
    colorToken: initial?.colorToken ?? DEFAULT_AGENDA_COLOR_TOKEN,
    displayName: initial?.displayName ?? "",
    email: initial?.email ?? "",
    linkedUserId: initial?.linkedUserId ?? null,
    notes: initial?.notes ?? "",
    phone: initial?.phone ?? "",
    registrationNumber: initial?.registrationNumber ?? "",
    registrationType: initial?.registrationType ?? "",
    specialties: initial?.specialties ?? [],
    status: initial?.status ?? "active",
  };
}

/**
 * Formulário de criação e edição de profissional, em painel lateral acessível.
 *
 * O componente é puro em relação a dados: recebe os valores iniciais, a lista de
 * usuários da equipe e a ação por prop. Ele **não** conhece Server Action, RPC
 * nem banco — quem o renderiza fornece o `onSubmit` real. Enquanto o backend não
 * estiver integrado, nenhuma página o renderiza, justamente para não existir
 * botão que aparente salvar sem salvar.
 */
export function ProfessionalForm({
  open,
  mode,
  initialValues,
  teamMembers = [],
  timezoneLabel,
  submitting = false,
  submitError = null,
  onSubmit,
  onClose,
}: {
  open: boolean;
  mode: "create" | "edit";
  initialValues?: Partial<ProfessionalFormValues>;
  teamMembers?: readonly TeamMemberOption[];
  timezoneLabel?: string;
  submitting?: boolean;
  submitError?: string | null;
  onSubmit: (values: ProfessionalFormValues) => void | Promise<void>;
  onClose: () => void;
}) {
  const baseId = useId();
  const initial = useMemo(() => initialFormValues(initialValues), [initialValues]);
  const [values, setValues] = useState<ProfessionalFormValues>(initial);
  const [errors, setErrors] = useState<FieldErrors<ProfessionalFieldKey>>({});
  const [attempted, setAttempted] = useState(0);
  const formId = `${baseId}-professional-form`;

  const fieldId = (key: ProfessionalFieldKey | "color" | "status" | "registrationType" | "linkedUser") =>
    `${baseId}-${key}`;

  const dirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(initial),
    [initial, values],
  );

  // Leva o foco ao primeiro campo com erro. Cada envio cria um pedido novo,
  // então o foco também se repete quando o mesmo campo continua inválido.
  const [focusRequest, setFocusRequest] = useState<{ readonly fieldId: string } | null>(null);
  useEffect(() => {
    if (!focusRequest) return;
    document.getElementById(focusRequest.fieldId)?.focus();
  }, [focusRequest]);

  function patch(next: Partial<ProfessionalFormValues>) {
    setValues((current) => {
      const merged = { ...current, ...next };
      // Depois da primeira tentativa, os erros acompanham a digitação.
      if (attempted > 0) setErrors(validateProfessionalForm(merged));
      return merged;
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateProfessionalForm(values);
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

  return <FormPanel
    description={mode === "create"
      ? "O profissional pode ser cadastrado mesmo sem conta de acesso ao sistema."
      : "As alterações passam pelas mesmas validações no servidor."}
    dirty={dirty}
    footer={<>
      <Button onClick={onClose} size="sm" type="button" variant="outline">Cancelar</Button>
      <Button disabled={submitting} form={formId} size="sm" type="submit">
        {submitting ? "Salvando…" : mode === "create" ? "Cadastrar profissional" : "Salvar alterações"}
      </Button>
    </>}
    onRequestClose={onClose}
    open={open}
    title={mode === "create" ? "Novo profissional" : "Editar profissional"}
  >
    <form className="space-y-5" id={formId} noValidate onSubmit={submit}>
      {submitError ? <FeedbackBanner tone="error">{submitError}</FeedbackBanner> : null}
      <ErrorSummary autoFocus={false} entries={summaryEntries} />

      <FormFieldset
        description="Como o profissional aparece na agenda e nas listas."
        legend="Identificação"
      >
        <div className="grid gap-4">
          <FormField
            error={errors.displayName ?? null}
            help="Nome usado na agenda e nos relatórios."
            id={fieldId("displayName")}
            label="Nome de exibição"
            required
          >
            <Input
              aria-describedby={fieldDescribedBy(fieldId("displayName"), { error: Boolean(errors.displayName), help: true })}
              aria-invalid={Boolean(errors.displayName) || undefined}
              autoComplete="off"
              id={fieldId("displayName")}
              maxLength={80}
              onChange={(event) => patch({ displayName: event.target.value })}
              value={values.displayName}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              error={errors.email ?? null}
              help="Usado apenas para contato interno."
              hint="opcional"
              id={fieldId("email")}
              label="E-mail"
            >
              <Input
                aria-describedby={fieldDescribedBy(fieldId("email"), { error: Boolean(errors.email), help: true })}
                aria-invalid={Boolean(errors.email) || undefined}
                autoComplete="off"
                id={fieldId("email")}
                inputMode="email"
                onChange={(event) => patch({ email: event.target.value })}
                type="email"
                value={values.email}
              />
            </FormField>

            <FormField
              error={errors.phone ?? null}
              help="Somente os dígitos são guardados; a máscara é visual."
              hint="opcional"
              id={fieldId("phone")}
              label="Telefone"
            >
              <Input
                aria-describedby={fieldDescribedBy(fieldId("phone"), { error: Boolean(errors.phone), help: true })}
                aria-invalid={Boolean(errors.phone) || undefined}
                autoComplete="off"
                id={fieldId("phone")}
                inputMode="tel"
                // O valor de trabalho continua sendo só dígitos: a formatação é
                // aplicada na exibição e desfeita na leitura, sem corromper nada.
                onChange={(event) => patch({ phone: phoneDigits(event.target.value) })}
                type="tel"
                value={formatBrPhoneDigits(values.phone)}
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              hint="opcional"
              id={fieldId("registrationType")}
              label="Tipo de registro profissional"
            >
              <select
                className={formSelectClassName}
                id={fieldId("registrationType")}
                onChange={(event) => patch({ registrationType: event.target.value })}
                value={values.registrationType}
              >
                <option value="">Sem registro</option>
                {REGISTRATION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </FormField>

            <FormField
              error={errors.registrationNumber ?? null}
              hint="opcional"
              id={fieldId("registrationNumber")}
              label="Número de registro"
            >
              <Input
                aria-describedby={fieldDescribedBy(fieldId("registrationNumber"), { error: Boolean(errors.registrationNumber) })}
                aria-invalid={Boolean(errors.registrationNumber) || undefined}
                autoComplete="off"
                disabled={values.registrationType === ""}
                id={fieldId("registrationNumber")}
                maxLength={30}
                onChange={(event) => patch({ registrationNumber: event.target.value })}
                value={values.registrationNumber}
              />
            </FormField>
          </div>
        </div>
      </FormFieldset>

      <FormFieldset
        description="A cor identifica o profissional na agenda; o nome da cor acompanha sempre."
        legend="Agenda e situação"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={fieldId("color")} label="Cor da agenda">
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
              color={AGENDA_COLORS.find((color) => color.token === values.colorToken)?.cssValue ?? AGENDA_COLORS[0]!.cssValue}
              label={`Cor selecionada: ${AGENDA_COLORS.find((color) => color.token === values.colorToken)?.label ?? AGENDA_COLORS[0]!.label}`}
            />
          </FormField>

          <FormField
            help="Profissionais inativos não recebem novos agendamentos."
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

      <SpecialtyEditor
        id={`${baseId}-specialty`}
        onChange={(specialties) => patch({ specialties })}
        specialties={values.specialties}
      />

      <FormFieldset
        description="Vincule quando o profissional também usa o sistema. Sem vínculo, o cadastro continua válido."
        legend="Conta de acesso"
      >
        <FormField
          help={teamMembers.length === 0
            ? "Nenhum usuário da equipe disponível para vínculo no momento."
            : "Apenas usuários já convidados para a clínica aparecem aqui."}
          hint="opcional"
          id={fieldId("linkedUser")}
          label="Usuário da equipe"
        >
          <select
            aria-describedby={fieldDescribedBy(fieldId("linkedUser"), { help: true })}
            className={formSelectClassName}
            disabled={teamMembers.length === 0}
            id={fieldId("linkedUser")}
            onChange={(event) => patch({ linkedUserId: event.target.value === "" ? null : event.target.value })}
            value={values.linkedUserId ?? ""}
          >
            <option value="">Sem conta vinculada</option>
            {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </FormField>
      </FormFieldset>

      <div>
        <WeeklyAvailabilityEditor
          availability={values.availability}
          headingId={fieldId("availability")}
          onChange={(availability) => patch({ availability })}
          timezoneLabel={timezoneLabel}
        />
        {errors.availability
          ? <p className="mt-1.5 text-xs font-medium text-destructive" role="alert">{errors.availability}</p>
          : null}
      </div>

      <FormField
        error={errors.notes ?? null}
        help="Anotações internas da equipe. Não aparecem para o paciente."
        hint={`${values.notes.length}/${MAX_NOTES_LENGTH}`}
        id={fieldId("notes")}
        label="Observações"
      >
        <textarea
          aria-describedby={fieldDescribedBy(fieldId("notes"), { error: Boolean(errors.notes), help: true })}
          aria-invalid={Boolean(errors.notes) || undefined}
          className={formTextareaClassName}
          id={fieldId("notes")}
          maxLength={MAX_NOTES_LENGTH}
          onChange={(event) => patch({ notes: event.target.value })}
          rows={3}
          value={values.notes}
        />
      </FormField>
    </form>
  </FormPanel>;
}
