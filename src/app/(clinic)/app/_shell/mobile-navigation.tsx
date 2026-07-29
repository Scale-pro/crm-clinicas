"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/shared/ui/button";

/**
 * Sidebar como drawer no mobile. Usa `<dialog>` nativo — foco preso, Escape e
 * camada de fundo vêm do navegador. Fecha automaticamente ao trocar de rota.
 */
export function MobileNavigation({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Fecha ao trocar de rota — ajuste durante a renderização, sem efeito extra.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  return <>
    <Button
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label="Abrir navegação"
      className="lg:hidden"
      onClick={() => setOpen(true)}
      ref={triggerRef}
      size="icon"
      type="button"
      variant="ghost"
    >
      <Menu aria-hidden="true" />
    </Button>
    <dialog
      aria-label="Navegação do CRM"
      className="fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-none w-[17rem] max-w-[85vw] bg-sidebar p-0 text-sidebar-foreground shadow-2xl backdrop:bg-foreground/50 lg:hidden"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === dialogRef.current) close(); }}
      ref={dialogRef}
    >
      <div className="relative h-full">
        <Button
          aria-label="Fechar navegação"
          className="absolute right-2 top-2.5 z-10 text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground"
          onClick={close}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
        {children}
      </div>
    </dialog>
  </>;
}
