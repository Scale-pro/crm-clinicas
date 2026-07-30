"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/shared/lib/utils";

export type ErrorSummaryEntry = {
  /** `id` do controle correspondente — o link move o foco direto para ele. */
  readonly fieldId: string;
  readonly message: string;
};

/**
 * Resumo dos erros de um formulário. Recebe o foco quando aparece, é anunciado
 * como alerta e leva ao primeiro campo com problema. É complementar (não
 * substituto) das mensagens por campo.
 */
export function ErrorSummary({
  entries,
  title = "Revise os campos destacados",
  autoFocus = true,
  className,
}: {
  entries: readonly ErrorSummaryEntry[];
  title?: string;
  /**
   * Recebe o foco ao aparecer. Desligue quando o formulário preferir levar o
   * foco direto ao primeiro campo com erro — nunca deixe os dois competindo.
   */
  autoFocus?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const signature = entries.map((entry) => entry.fieldId).join("|");

  useEffect(() => {
    if (autoFocus && signature) containerRef.current?.focus();
  }, [autoFocus, signature]);

  if (entries.length === 0) return null;

  return <div
    className={cn(
      "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      className,
    )}
    ref={containerRef}
    role="alert"
    tabIndex={-1}
  >
    <p className="font-medium">{title}</p>
    <ul className="mt-1.5 space-y-1">
      {entries.map((entry) => <li key={entry.fieldId}>
        <a
          className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          href={`#${entry.fieldId}`}
          onClick={(event) => {
            const target = document.getElementById(entry.fieldId);
            if (!target) return;
            event.preventDefault();
            target.focus();
          }}
        >
          {entry.message}
        </a>
      </li>)}
    </ul>
  </div>;
}
