"use client";

import { SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import { Button } from "./button";

/**
 * Filtros avançados em painel compacto. Os campos permanecem montados (apenas
 * ocultos) para que continuem sendo enviados no `form method="get"` que os
 * envolve — a filtragem segue acontecendo no servidor.
 */
export function FilterPopover({ label = "Filtros", activeCount = 0, children, footer, className }: {
  label?: string;
  activeCount?: number;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

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
      aria-controls={panelId}
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
      ref={triggerRef}
      size="sm"
      type="button"
      variant="outline"
    >
      <SlidersHorizontal aria-hidden="true" />
      {label}
      {activeCount > 0 ? <span className="rounded-full bg-accent px-1.5 text-[0.6875rem] font-semibold leading-4 text-accent-foreground">{activeCount}</span> : null}
    </Button>
    <div
      className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-3 shadow-lg"
      hidden={!open}
      id={panelId}
    >
      <div className="grid gap-3">{children}</div>
      {footer ? <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">{footer}</div> : null}
    </div>
  </div>;
}
