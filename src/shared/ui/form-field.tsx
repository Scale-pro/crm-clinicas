import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

/** IDs derivados do campo: a ajuda e o erro precisam ser referenciáveis. */
export function fieldHelpId(id: string): string {
  return `${id}-help`;
}

export function fieldErrorId(id: string): string {
  return `${id}-error`;
}

/**
 * Lista de `aria-describedby` do campo, na ordem em que deve ser lida:
 * ajuda contextual primeiro, erro depois. `undefined` quando não há nenhuma.
 */
export function fieldDescribedBy(id: string, options: {
  help?: boolean;
  error?: boolean;
}): string | undefined {
  const ids = [
    options.help ? fieldHelpId(id) : null,
    options.error ? fieldErrorId(id) : null,
  ].filter((value): value is string => value !== null);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

/**
 * Envelope de campo de formulário: rótulo real vinculado ao controle, ajuda
 * contextual e mensagem de erro anunciada. O erro nunca é comunicado apenas
 * por cor — há texto e `aria-invalid` no controle (ADR-011).
 */
export function FormField({ id, label, help, error, required, hint, children, className }: {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** Texto curto à direita do rótulo (ex.: "opcional", contador). */
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("grid gap-1.5", className)}>
    <div className="flex items-baseline justify-between gap-2">
      <label className="text-sm font-medium leading-none" htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true" className="ms-0.5 text-destructive">*</span> : null}
        {required ? <span className="sr-only"> (obrigatório)</span> : null}
      </label>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
    {children}
    {help ? <p className="text-xs text-muted-foreground" id={fieldHelpId(id)}>{help}</p> : null}
    {error ? <p className="text-xs font-medium text-destructive" id={fieldErrorId(id)}>{error}</p> : null}
  </div>;
}

/**
 * Agrupamento semântico de campos relacionados. `legend` é o nome acessível do
 * grupo — usado por leitores de tela ao entrar no conjunto.
 */
export function FormFieldset({ legend, description, children, className }: {
  legend: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return <fieldset className={cn("min-w-0 border-0 p-0", className)}>
    <legend className="mb-1 text-sm font-medium leading-none">{legend}</legend>
    {description ? <p className="mb-2 text-xs text-muted-foreground">{description}</p> : null}
    {children}
  </fieldset>;
}

/** Classe compartilhada dos `select` nativos usados nos formulários. */
export const formSelectClassName =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50";

/** Classe compartilhada das áreas de texto multilinha. */
export const formTextareaClassName =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50";
