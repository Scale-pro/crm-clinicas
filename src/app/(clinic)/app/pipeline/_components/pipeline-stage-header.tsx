/**
 * Cabeçalho de uma coluna do Kanban: nome da etapa, contagem, soma dos valores
 * e um acento fino com a cor da etapa. A cor nunca é a única pista — o nome e
 * os números sempre estão presentes.
 */
export function PipelineStageHeader({ accent, count, headingId, name, totalLabel }: {
  accent: string;
  count: number;
  headingId: string;
  name: string;
  totalLabel: string;
}) {
  return <div className="sticky top-0 z-10 rounded-t-lg border-b border-border bg-surface-subtle/95 backdrop-blur">
    <span aria-hidden="true" className="block h-1 rounded-t-lg" style={{ backgroundColor: accent }} />
    <div className="flex items-baseline justify-between gap-2 px-3 py-2">
      <h2 className="min-w-0 truncate text-sm font-semibold" id={headingId}>{name}</h2>
      <span className="shrink-0 rounded-full bg-background px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
        {count}
      </span>
    </div>
    <p className="px-3 pb-2 text-xs tabular-nums text-muted-foreground">{totalLabel}</p>
  </div>;
}
