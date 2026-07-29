import type { ReactNode } from "react";

import { PipelineStageHeader } from "./pipeline-stage-header";

/**
 * Coluna do quadro com largura consistente, cabeçalho fixo e corpo rolável.
 */
export function KanbanColumn({ accent, count, headingId, name, totalLabel, children }: {
  accent: string;
  count: number;
  headingId: string;
  name: string;
  totalLabel: string;
  children: ReactNode;
}) {
  return <section
    aria-labelledby={headingId}
    className="flex h-full w-[min(84vw,18rem)] shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-border bg-surface-subtle"
  >
    <PipelineStageHeader accent={accent} count={count} headingId={headingId} name={name} totalLabel={totalLabel} />
    <div className="scroll-slim min-h-0 flex-1 space-y-2 overflow-y-auto p-2">{children}</div>
  </section>;
}
