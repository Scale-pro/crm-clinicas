import { cn } from "@/shared/lib/utils";

/**
 * Iniciais de uma pessoa, para cabeçalhos e listas densas.
 *
 * As iniciais são decorativas: quem lê por leitor de tela recebe o nome por
 * extenso do elemento vizinho, então o círculo fica fora da árvore de
 * acessibilidade (ADR-011). A cor de acento é opcional e nunca carrega
 * informação sozinha — serve só para amarrar a pessoa à sua coluna.
 */
export function Avatar({ name, accent, className, size = "md" }: {
  name: string;
  /** Cor da pessoa (ex.: cor do profissional). Usada como fundo suave. */
  accent?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("pt-BR") ?? "")
    .join("");

  return <span
    aria-hidden="true"
    className={cn(
      "grid shrink-0 place-items-center rounded-full border font-medium tabular-nums",
      size === "sm" ? "size-6 text-[0.625rem]" : "size-8 text-xs",
      accent ? "border-transparent" : "border-border bg-muted text-muted-foreground",
      className,
    )}
    style={accent
      ? {
        backgroundColor: `color-mix(in oklab, ${accent} 16%, transparent)`,
        color: `color-mix(in oklab, ${accent} 72%, var(--color-foreground))`,
      }
      : undefined}
  >
    {initials}
  </span>;
}
