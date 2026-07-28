"use client";

import { MoreHorizontal } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import { Button } from "./button";

/**
 * Menu de ações secundárias. Fecha com Escape ou clique fora e devolve o foco
 * ao gatilho. Os itens são links/botões reais — nada depende de hover.
 */
export function ActionsMenu({ label = "Mais ações", children, className, align = "right" }: {
  label?: string;
  children: ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const pathname = usePathname();

  // Fecha ao trocar de rota — ajuste durante a renderização, sem efeito extra.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  return <div className={cn("relative", className)} ref={containerRef}>
    <Button
      aria-controls={menuId}
      aria-expanded={open}
      aria-label={label}
      onClick={() => setOpen((value) => !value)}
      ref={triggerRef}
      size="icon"
      type="button"
      variant="outline"
    >
      <MoreHorizontal aria-hidden="true" />
    </Button>
    <div
      className={cn(
        "absolute z-30 mt-2 w-56 rounded-lg border border-border bg-surface p-1 shadow-lg",
        align === "right" ? "right-0" : "left-0",
      )}
      hidden={!open}
      id={menuId}
    >
      {children}
    </div>
  </div>;
}

/** Estilo compartilhado dos itens do menu (aplicável a `Link`, `button`, `a`). */
export const actionsMenuItemClassName =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";
