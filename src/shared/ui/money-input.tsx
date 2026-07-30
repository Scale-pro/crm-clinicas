"use client";

import { useState } from "react";

import { formatCentsAsAmount, parseAmountToCents } from "@/shared/lib/currency";
import { cn } from "@/shared/lib/utils";

import { resolveSyncedText } from "./controlled-field";

/** Somente o que pode compor um valor em pt-BR — o sinal negativo nunca entra. */
const ALLOWED_CHARACTERS = /[^\d.,]/g;

/**
 * Campo monetário em BRL. O estado interno é o texto digitado — a máscara não
 * reescreve enquanto se digita, então apagar ou colar nunca corrompe o valor.
 * A normalização acontece ao sair do campo. O valor de trabalho para o
 * chamador é sempre em centavos (`null` enquanto o texto não é válido).
 *
 * Mudanças externas de `valueCents` (ex.: "voltar ao preço-base", que zera o
 * override para `null`) refletem no texto assim que o campo perde o foco de
 * edição — sem apagar a digitação em andamento.
 */
export function MoneyInput({
  id,
  name,
  valueCents,
  onChange,
  describedBy,
  invalid = false,
  disabled = false,
  className,
}: {
  id: string;
  name?: string;
  valueCents: number | null;
  onChange: (cents: number | null, rawValue: string) => void;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(() => valueCents === null ? "" : formatCentsAsAmount(valueCents));
  const [synced, setSynced] = useState<number | null>(valueCents);

  // Ajuste de estado durante a renderização (padrão recomendado do React):
  // adota a prop externa somente fora de edição. Nunca dispara em uma montagem
  // nova (incoming === synced), então a renderização estática não é afetada.
  const sync = resolveSyncedText({ editing, format: formatCentsAsAmount, incoming: valueCents, synced });
  if (sync) {
    setText(sync.text);
    setSynced(sync.synced);
  }

  return <div className={cn("relative", className)}>
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
    >
      R$
    </span>
    <input
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      autoComplete="off"
      className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm tabular-nums shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid]:border-destructive"
      disabled={disabled}
      id={id}
      inputMode="decimal"
      name={name}
      onBlur={() => {
        setEditing(false);
        const cents = parseAmountToCents(text);
        if (cents === null) {
          // Texto vazio ou temporariamente inválido: o campo passa a refletir a
          // prop comprometida (limpa quando `null`) — nunca vira zero.
          setText(valueCents === null ? "" : formatCentsAsAmount(valueCents));
          setSynced(valueCents);
        } else {
          setText(formatCentsAsAmount(cents));
          setSynced(cents);
        }
      }}
      onChange={(event) => {
        const next = event.target.value.replace(ALLOWED_CHARACTERS, "");
        setText(next);
        onChange(next.trim() === "" ? null : parseAmountToCents(next), next);
      }}
      onFocus={() => setEditing(true)}
      placeholder="0,00"
      type="text"
      value={text}
    />
  </div>;
}
