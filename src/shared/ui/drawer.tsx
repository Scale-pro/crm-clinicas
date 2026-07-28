"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import { Button, type ButtonProps } from "./button";

const sides = {
  right: "inset-y-0 right-0 left-auto h-dvh w-full max-w-md border-l",
  left: "inset-y-0 left-0 right-auto h-dvh w-[17rem] border-r",
} as const;

/**
 * Painel lateral em `<dialog>` nativo: o navegador cuida do foco preso, da
 * pilha de camadas e do fechamento por Escape. O gatilho recupera o foco ao
 * fechar. O conteúdo pode ser renderizado no servidor (passado como children).
 */
export function Drawer({
  triggerLabel,
  triggerIcon,
  triggerProps,
  title,
  description,
  side = "right",
  defaultOpen = false,
  className,
  children,
}: {
  triggerLabel: ReactNode;
  triggerIcon?: ReactNode;
  triggerProps?: ButtonProps;
  title: string;
  description?: string;
  side?: keyof typeof sides;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  return <>
    <Button
      {...triggerProps}
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={() => setOpen(true)}
      ref={triggerRef}
      type="button"
    >
      {triggerIcon}
      {triggerLabel}
    </Button>
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={cn(
        "fixed m-0 max-h-none bg-surface p-0 text-foreground shadow-2xl backdrop:bg-foreground/40 backdrop:backdrop-blur-[1px]",
        sides[side],
        className,
      )}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === dialogRef.current) close(); }}
      ref={dialogRef}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold" id={titleId}>{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-muted-foreground" id={descriptionId}>{description}</p> : null}
          </div>
          <Button aria-label="Fechar painel" onClick={close} size="icon" type="button" variant="ghost">
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </dialog>
  </>;
}
