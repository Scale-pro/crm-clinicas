import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

const tones = {
  success: "border-success/40 bg-success/10 text-success-strong",
  warning: "border-warning/50 bg-warning/10 text-warning-strong",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
} as const;

/**
 * Faixa de feedback de uma ação. Mensagens são sempre neutras e escritas para
 * o usuário — nunca expõem erros do banco, SQL ou identificadores técnicos.
 */
export function FeedbackBanner({ tone, children, className }: {
  tone: keyof typeof tones;
  children: ReactNode;
  className?: string;
}) {
  return <p
    className={cn("rounded-md border px-3 py-2 text-sm", tones[tone], className)}
    role={tone === "success" ? "status" : "alert"}
  >
    {children}
  </p>;
}
