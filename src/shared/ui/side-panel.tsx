"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import { Button } from "./button";

/**
 * Camada modal controlada pelo chamador — irmã do `Drawer`, que abre pelo
 * próprio gatilho. Aqui a abertura vem do estado (clicar num card da agenda,
 * por exemplo), então o componente recebe `open` e `onClose`.
 *
 * Usa `<dialog>` nativo: o navegador prende o foco, empilha a camada e trata
 * Escape. Devolver o foco ao elemento de origem é responsabilidade de quem
 * abriu — é quem sabe qual era.
 */

const layouts = {
  right: "inset-y-0 right-0 left-auto m-0 h-dvh w-full max-w-md border-l",
  center: "m-auto max-h-[min(90dvh,56rem)] w-[min(100%-2rem,64rem)] rounded-xl border",
} as const;

export function SidePanel({
  open,
  onClose,
  title,
  description,
  layout = "right",
  header,
  footer,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  layout?: keyof typeof layouts;
  /** Substitui o cabeçalho padrão, mantendo o botão de fechar. */
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return <dialog
    aria-describedby={description ? descriptionId : undefined}
    aria-label={title}
    className={cn(
      "fixed z-50 flex max-h-dvh min-h-0 flex-col overflow-hidden border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-foreground/40 backdrop:backdrop-blur-[2px]",
      layouts[layout],
      className,
    )}
    onCancel={(event) => {
      event.preventDefault();
      onClose();
    }}
    onClick={(event) => {
      // Clique fora do conteúdo: em `<dialog>` o alvo é o próprio elemento.
      if (event.target === dialogRef.current) onClose();
    }}
    ref={dialogRef}
  >
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
      {header ?? <div className="min-w-0">
        <h2 className="truncate text-base font-semibold">{title}</h2>
        {description
          ? <p className="mt-0.5 text-sm text-muted-foreground" id={descriptionId}>{description}</p>
          : null}
      </div>}
      <Button aria-label="Fechar" onClick={onClose} size="icon" type="button" variant="ghost">
        <X aria-hidden="true" />
      </Button>
    </div>

    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-5">{children}</div>

    {footer
      ? <div className="shrink-0 border-t border-border px-5 py-4">{footer}</div>
      : null}
  </dialog>;
}
