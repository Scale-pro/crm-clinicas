import type { StatusTone } from "@/shared/ui/status-badge";

/**
 * Modelo de apresentação compartilhado entre o Kanban e a lista "Todos os
 * leads". Contém apenas dados já retornados pelo caso de uso do domínio —
 * nenhuma regra de negócio vive aqui e nenhum campo é inventado.
 */
export type LeadRow = {
  readonly id: string;
  readonly href: string;
  readonly title: string;
  readonly contactName: string;
  readonly assigneeName: string;
  readonly stageName: string;
  readonly stageAccent: string;
  readonly status: string;
  readonly sourceName: string | null;
  readonly amountCents: number | null;
  readonly amountLabel: string | null;
  readonly updatedLabel: string;
  /** Preparado para múltiplos pipelines; hoje só existe o pipeline padrão. */
  readonly pipelineName: string | null;
};

export function statusLabel(status: string): string {
  if (status === "won") return "Ganha";
  if (status === "lost") return "Perdida";
  return "Aberta";
}

export function statusTone(status: string): StatusTone {
  if (status === "won") return "success";
  if (status === "lost") return "danger";
  return "accent";
}

export function sumAmountCents(rows: readonly { readonly amountCents: number | null }[]): number {
  return rows.reduce((total, row) => total + (row.amountCents ?? 0), 0);
}
