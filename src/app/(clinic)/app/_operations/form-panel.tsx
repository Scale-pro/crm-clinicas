"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";

/**
 * Painel lateral de formulário, controlado pelo chamador.
 *
 * Difere do `Drawer` do design system em um ponto essencial: aqui o fechamento
 * é interceptado. Com alterações não salvas, Escape, clique no backdrop e o
 * botão de fechar pedem confirmação antes de descartar. O `<dialog>` nativo
 * continua responsável por prender o foco e empilhar a camada; o foco volta ao
 * elemento que abriu o painel.
 */
export function FormPanel({
  open,
  title,
  description,
  dirty = false,
  footer,
  onRequestClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  /** Há alterações não salvas — habilita a confirmação de descarte. */
  dirty?: boolean;
  footer?: ReactNode;
  onRequestClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<Element | null>(null);
  const [confirming, setConfirming] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      openerRef.current = document.activeElement;
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
      const opener = openerRef.current;
      if (opener instanceof HTMLElement) opener.focus();
    }
  }, [open]);

  function requestClose() {
    if (dirty) {
      setConfirming(true);
      return;
    }
    onRequestClose();
  }

  return <>
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-xl border-l border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-foreground/40 backdrop:backdrop-blur-[1px]"
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
      onClick={(event) => { if (event.target === dialogRef.current) requestClose(); }}
      ref={dialogRef}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold" id={titleId}>{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-muted-foreground" id={descriptionId}>{description}</p> : null}
          </div>
          <Button aria-label="Fechar painel" onClick={requestClose} size="icon" type="button" variant="ghost">
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-subtle px-4 py-3">{footer}</div> : null}
      </div>
    </dialog>

    <ConfirmDialog
      cancelLabel="Continuar editando"
      confirmLabel="Descartar alterações"
      description="As alterações feitas neste painel não foram salvas e serão perdidas."
      onCancel={() => setConfirming(false)}
      onConfirm={() => { setConfirming(false); onRequestClose(); }}
      open={confirming}
      title="Descartar alterações?"
      tone="destructive"
    />
  </>;
}
