import { cn } from "@/shared/lib/utils";

/**
 * Amostra de cor acompanhada do nome da cor. A cor sozinha nunca carrega a
 * informação (ADR-011): o texto é sempre exibido ou, quando o espaço é
 * mínimo, fica disponível para leitores de tela via `hideLabel`.
 */
export function ColorIndicator({ color, label, hideLabel = false, className }: {
  color: string;
  label: string;
  hideLabel?: boolean;
  className?: string;
}) {
  return <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-full border border-border"
      style={{ backgroundColor: color }}
    />
    <span className={hideLabel ? "sr-only" : "truncate text-sm"}>{label}</span>
  </span>;
}
