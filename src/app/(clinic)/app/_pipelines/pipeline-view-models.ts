import type { StatusTone } from "@/shared/ui/status-badge";

/**
 * Modelos de apresentação da configuração de pipelines.
 *
 * Adaptadores de fronteira puros: traduzem o que `listPipelines` devolve para o
 * que a tela desenha. Não conhecem banco, Server Action nem autorização.
 *
 * O que **não** existe aqui é tão importante quanto o que existe: o contrato
 * não informa contagem de oportunidades, cor de etapa nem versão de pipeline,
 * então nada disso é inventado.
 */

export type StageKind = "open" | "won" | "lost";

export type PipelineStageView = {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly kind: StageKind;
};

export type PipelineView = {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly archived: boolean;
  readonly createdAtLabel: string;
  readonly updatedAtLabel: string;
  readonly stages: readonly PipelineStageView[];
};

export function stageKind(kind: string): StageKind {
  if (kind === "won") return "won";
  if (kind === "lost") return "lost";
  return "open";
}

export function stageKindLabel(kind: StageKind): string {
  if (kind === "won") return "Ganha";
  if (kind === "lost") return "Perdida";
  return "Aberta";
}

export function stageKindTone(kind: StageKind): StatusTone {
  if (kind === "won") return "success";
  if (kind === "lost") return "danger";
  return "neutral";
}

/** Etapas abertas, na ordem em que aparecem — as únicas reordenáveis. */
export function openStages(
  stages: readonly PipelineStageView[],
): readonly PipelineStageView[] {
  return stages.filter((stage) => stage.kind === "open");
}

/**
 * Move uma etapa aberta uma posição para cima ou para baixo.
 *
 * Devolve a lista original quando o movimento sairia da faixa — nunca embaralha
 * por acidente. Função pura para que a regra de ordenação seja testável sem
 * navegador.
 */
export function moveOpenStage(
  openIds: readonly string[],
  index: number,
  direction: -1 | 1,
): readonly string[] {
  const target = index + direction;
  if (index < 0 || index >= openIds.length) return openIds;
  if (target < 0 || target >= openIds.length) return openIds;
  const next = [...openIds];
  const moved = next[index]!;
  next[index] = next[target]!;
  next[target] = moved;
  return next;
}

/**
 * Reconstrói a ordem completa exigida pelo contrato: as etapas de encerramento
 * permanecem exatamente onde estavam e apenas as abertas são permutadas entre
 * si. Assim salvar a ordem nunca move ganho ou perda por efeito colateral.
 */
export function fullStageOrder(
  stages: readonly PipelineStageView[],
  openIds: readonly string[],
): readonly string[] {
  let cursor = 0;
  return stages.map((stage) => stage.kind === "open" ? openIds[cursor++] ?? stage.id : stage.id);
}

/** `true` quando a ordem em edição difere da ordem vinda do servidor. */
export function orderChanged(
  initialOpenIds: readonly string[],
  openIds: readonly string[],
): boolean {
  if (initialOpenIds.length !== openIds.length) return true;
  return openIds.some((id, index) => id !== initialOpenIds[index]);
}

/**
 * Um pipeline só pode ser arquivado quando existe outro ativo para receber o
 * trabalho — e o padrão nunca é arquivável. O servidor recusa os dois casos; a
 * interface apenas evita oferecer um botão que falharia.
 */
export function canArchivePipeline(
  pipeline: PipelineView,
  allPipelines: readonly PipelineView[],
): boolean {
  if (pipeline.archived || pipeline.isDefault) return false;
  return allPipelines.filter((item) => !item.archived).length > 1;
}

/** Motivo textual de um arquivamento indisponível — a tela explica, não só desabilita. */
export function archiveBlockedReason(
  pipeline: PipelineView,
  allPipelines: readonly PipelineView[],
): string | null {
  if (pipeline.archived) return "Este pipeline já está arquivado.";
  if (pipeline.isDefault) return "O pipeline padrão não pode ser arquivado. Defina outro como padrão antes.";
  if (allPipelines.filter((item) => !item.archived).length <= 1) {
    return "Este é o último pipeline ativo da clínica e não pode ser arquivado.";
  }
  return null;
}
