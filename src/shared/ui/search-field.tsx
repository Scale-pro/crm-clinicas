import { Search } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import { Button } from "./button";

/**
 * Campo de pesquisa server-side: vive dentro de um form `method="get"` e envia
 * o termo como query string. O rótulo é sempre vinculado (pode ser visualmente
 * oculto) e o botão de envio garante uso sem teclado físico.
 */
export function SearchField({
  id,
  name = "q",
  defaultValue = "",
  label = "Pesquisar",
  placeholder,
  hideLabel = true,
  submitLabel = "Buscar",
  className,
}: {
  id: string;
  name?: string;
  defaultValue?: string;
  label?: string;
  placeholder?: string;
  hideLabel?: boolean;
  submitLabel?: string;
  className?: string;
}) {
  return <div className={cn("flex min-w-0 flex-1 items-end gap-2 sm:max-w-sm", className)}>
    <div className="min-w-0 flex-1">
      <label className={hideLabel ? "sr-only" : "mb-1 block text-xs font-medium"} htmlFor={id}>{label}</label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          defaultValue={defaultValue}
          id={id}
          maxLength={160}
          name={name}
          placeholder={placeholder}
          type="search"
        />
      </div>
    </div>
    <Button size="sm" type="submit" variant="outline">{submitLabel}</Button>
  </div>;
}
