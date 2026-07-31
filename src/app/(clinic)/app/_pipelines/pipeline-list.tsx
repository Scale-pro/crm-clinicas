import Link from "next/link";

import { cn } from "@/shared/lib/utils";
import { StatusBadge } from "@/shared/ui/status-badge";

import type { PipelineView } from "./pipeline-view-models";

/**
 * Lista lateral de pipelines. Componente puro: recebe os pipelines já
 * carregados e o selecionado, e navega por links reais — a seleção vive na URL,
 * então um link compartilhado abre a mesma tela.
 *
 * A contagem exibida é de etapas, que o contrato informa. Quantidade de
 * oportunidades por pipeline **não** é exibida: `listPipelines` não a devolve, e
 * somá-la aqui exigiria uma chamada por pipeline.
 */
export function PipelineList({ pipelines, selectedId, basePath }: {
  pipelines: readonly PipelineView[];
  selectedId: string | null;
  basePath: string;
}) {
  return <nav aria-label="Pipelines da clínica" className="rounded-lg border border-border bg-surface">
    <ul className="divide-y divide-border">
      {pipelines.map((pipeline) => {
        const active = pipeline.id === selectedId;
        return <li key={pipeline.id}>
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-col gap-1 px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active && "bg-muted",
            )}
            href={`${basePath}?pipeline=${encodeURIComponent(pipeline.id)}`}
          >
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="min-w-0 truncate text-sm font-medium">{pipeline.name}</span>
              {pipeline.isDefault ? <StatusBadge tone="accent">Padrão</StatusBadge> : null}
              {pipeline.archived ? <StatusBadge tone="neutral">Arquivado</StatusBadge> : null}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {pipeline.stages.length} etapa(s)
            </span>
          </Link>
        </li>;
      })}
    </ul>
  </nav>;
}
