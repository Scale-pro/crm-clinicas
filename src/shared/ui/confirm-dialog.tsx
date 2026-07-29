"use client";

import { useEffect, useId, useRef } from "react";

import { Button } from "./button";

/**
 * Confirmação de uma ação com consequência. Usa `<dialog>` nativo: o navegador
 * prende o foco, empilha a camada e trata Escape. O foco volta ao elemento que
 * abriu o diálogo — o chamador controla isso ao devolver `open` para `false`.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "default",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "destructive";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      confirmRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return <dialog
    aria-describedby={description ? descriptionId : undefined}
    aria-labelledby={titleId}
    className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-foreground/40"
    onCancel={(event) => { event.preventDefault(); onCancel(); }}
    ref={dialogRef}
  >
    <div className="p-4">
      <h2 className="text-sm font-semibold" id={titleId}>{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground" id={descriptionId}>{description}</p> : null}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button onClick={onCancel} size="sm" type="button" variant="outline">{cancelLabel}</Button>
        <Button
          onClick={onConfirm}
          ref={confirmRef}
          size="sm"
          type="button"
          variant={tone === "destructive" ? "destructive" : "default"}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  </dialog>;
}
