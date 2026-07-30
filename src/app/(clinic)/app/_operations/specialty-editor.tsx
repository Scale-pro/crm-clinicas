"use client";

import { Plus, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/shared/ui/button";
import { fieldDescribedBy, fieldErrorId, fieldHelpId } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";

import {
  MAX_SPECIALTIES,
  MAX_SPECIALTY_LENGTH,
  addSpecialty,
  removeSpecialty,
} from "./operations-validation";

/**
 * Editor de especialidades do profissional. Lista livre por clínica — não há
 * catálogo global: cada clínica escreve os termos que usa.
 *
 * Duplicatas são detectadas ignorando caixa e acento ("Botox" = "botox"), o
 * texto é aparado e a remoção devolve o foco ao campo de entrada para permitir
 * uso contínuo por teclado.
 */
export function SpecialtyEditor({
  specialties,
  onChange,
  id,
  disabled = false,
  legend = "Especialidades",
}: {
  specialties: readonly string[];
  onChange: (next: readonly string[]) => void;
  id?: string;
  disabled?: boolean;
  legend?: string;
}) {
  const generatedId = useId();
  const fieldId = id ?? `${generatedId}-specialty`;
  const listId = `${generatedId}-specialty-list`;
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const atLimit = specialties.length >= MAX_SPECIALTIES;

  function commit() {
    const result = addSpecialty(specialties, draft);
    setMessage(result.message);
    if (result.status !== "added") return;
    onChange(result.specialties);
    setDraft("");
  }

  function drop(specialty: string) {
    onChange(removeSpecialty(specialties, specialty));
    setMessage(null);
    inputRef.current?.focus();
  }

  return <fieldset className="min-w-0 border-0 p-0" disabled={disabled}>
    <legend className="mb-1 text-sm font-medium leading-none">{legend}</legend>
    <p className="mb-2 text-xs text-muted-foreground" id={fieldHelpId(fieldId)}>
      Escreva os termos usados nesta clínica e pressione Enter para adicionar. Até {MAX_SPECIALTIES} especialidades.
    </p>

    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1">
        <label className="sr-only" htmlFor={fieldId}>Nova especialidade</label>
        <Input
          aria-describedby={fieldDescribedBy(fieldId, { error: message !== null, help: true })}
          aria-invalid={message !== null || undefined}
          autoComplete="off"
          id={fieldId}
          maxLength={MAX_SPECIALTY_LENGTH}
          onChange={(event) => {
            setDraft(event.target.value);
            if (message) setMessage(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            // Enter adiciona a especialidade — nunca envia o formulário inteiro.
            event.preventDefault();
            commit();
          }}
          placeholder="Ex.: Harmonização facial"
          ref={inputRef}
          value={draft}
        />
      </div>
      <Button disabled={disabled || atLimit} onClick={commit} size="sm" type="button" variant="outline">
        <Plus aria-hidden="true" />
        Adicionar
      </Button>
    </div>

    {message ? <p className="mt-1.5 text-xs font-medium text-destructive" id={fieldErrorId(fieldId)} role="alert">{message}</p> : null}

    {specialties.length === 0
      ? <p className="mt-3 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
        Nenhuma especialidade adicionada. O profissional pode ser salvo sem especialidades.
      </p>
      : <ul aria-label="Especialidades adicionadas" className="mt-3 flex flex-wrap gap-1.5" id={listId}>
        {specialties.map((specialty) => <li key={specialty}>
          <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted py-0.5 pl-2 pr-0.5 text-xs font-medium">
            <span className="truncate">{specialty}</span>
            <button
              aria-label={`Remover especialidade ${specialty}`}
              className="grid size-5 shrink-0 place-items-center rounded transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
              disabled={disabled}
              onClick={() => drop(specialty)}
              type="button"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          </span>
        </li>)}
      </ul>}

    <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">
      {specialties.length} de {MAX_SPECIALTIES} especialidades.
    </p>
  </fieldset>;
}
