"use client";

import { useState } from "react";

import { formatMinutesAsDuration, parseDurationMinutes } from "@/shared/lib/duration";
import { cn } from "@/shared/lib/utils";

import { Button } from "./button";

/** Durações mais usadas em uma agenda de estética. */
export const DEFAULT_DURATION_PRESETS: readonly number[] = [30, 45, 60, 90];

/**
 * Campo de duração em minutos com atalhos das durações mais comuns. Os atalhos
 * são botões reais (alcançáveis por teclado) e o valor efetivo é sempre lido em
 * texto — o botão marcado não depende só de cor.
 */
export function DurationInput({
  id,
  name,
  valueMinutes,
  onChange,
  presets = DEFAULT_DURATION_PRESETS,
  describedBy,
  invalid = false,
  disabled = false,
  min = 0,
  max = 1440,
  className,
}: {
  id: string;
  name?: string;
  valueMinutes: number | null;
  onChange: (minutes: number | null, rawValue: string) => void;
  presets?: readonly number[];
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  min?: number;
  max?: number;
  className?: string;
}) {
  const [text, setText] = useState(() => valueMinutes === null ? "" : String(valueMinutes));

  function apply(minutes: number) {
    setText(String(minutes));
    onChange(minutes, String(minutes));
  }

  return <div className={cn("grid gap-2", className)}>
    <div className="flex items-center gap-2">
      <input
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        className="h-9 w-24 rounded-md border border-input bg-background px-3 text-sm tabular-nums shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid]:border-destructive"
        disabled={disabled}
        id={id}
        inputMode="numeric"
        max={max}
        min={min}
        name={name}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, "");
          setText(next);
          onChange(next === "" ? null : parseDurationMinutes(next), next);
        }}
        step={5}
        type="number"
        value={text}
      />
      <span className="text-sm text-muted-foreground">
        minutos
        {valueMinutes !== null && valueMinutes > 0
          ? <span className="ms-1 font-medium text-foreground">({formatMinutesAsDuration(valueMinutes)})</span>
          : null}
      </span>
    </div>
    <div aria-label="Durações frequentes" className="flex flex-wrap gap-1.5" role="group">
      {presets.map((preset) => {
        const selected = valueMinutes === preset;
        return <Button
          aria-pressed={selected}
          disabled={disabled}
          key={preset}
          onClick={() => apply(preset)}
          size="sm"
          type="button"
          variant={selected ? "secondary" : "outline"}
        >
          {formatMinutesAsDuration(preset)}
        </Button>;
      })}
    </div>
  </div>;
}
