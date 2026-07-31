import { describe, expect, it } from "vitest";

import {
  archiveBlockedReason,
  canArchivePipeline,
  fullStageOrder,
  moveOpenStage,
  openStages,
  orderChanged,
  stageKind,
  stageKindLabel,
  stageKindTone,
  type PipelineStageView,
  type PipelineView,
} from "./pipeline-view-models";

const stage = (over: Partial<PipelineStageView> & { id: string }): PipelineStageView => ({
  kind: "open",
  name: `Etapa ${over.id}`,
  position: 100,
  ...over,
});

/** Ordem típica: abertas no meio, encerramento no fim. */
const stages: readonly PipelineStageView[] = [
  stage({ id: "a", position: 100 }),
  stage({ id: "b", position: 200 }),
  stage({ id: "c", position: 300 }),
  stage({ id: "won", kind: "won", position: 400 }),
  stage({ id: "lost", kind: "lost", position: 500 }),
];

const pipeline = (over: Partial<PipelineView> & { id: string }): PipelineView => ({
  archived: false,
  createdAtLabel: "10/03/2026 09:00",
  isDefault: false,
  name: `Pipeline ${over.id}`,
  stages,
  updatedAtLabel: "11/03/2026 09:00",
  ...over,
});

describe("tipos de etapa", () => {
  it("mapeia os tipos conhecidos e trata desconhecido como aberta", () => {
    expect(stageKind("won")).toBe("won");
    expect(stageKind("lost")).toBe("lost");
    expect(stageKind("open")).toBe("open");
    expect(stageKind("qualquer")).toBe("open");
  });

  it("rótulo e tom acompanham o tipo", () => {
    expect(stageKindLabel("won")).toBe("Ganha");
    expect(stageKindLabel("lost")).toBe("Perdida");
    expect(stageKindLabel("open")).toBe("Aberta");
    expect(stageKindTone("won")).toBe("success");
    expect(stageKindTone("lost")).toBe("danger");
  });

  it("só as etapas abertas são reordenáveis", () => {
    expect(openStages(stages).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });
});

describe("reordenação de etapas", () => {
  it("move uma etapa para cima e para baixo", () => {
    expect(moveOpenStage(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveOpenStage(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("movimento fora da faixa devolve a lista intacta — nunca embaralha", () => {
    const order = ["a", "b", "c"];
    expect(moveOpenStage(order, 0, -1)).toEqual(order);
    expect(moveOpenStage(order, 2, 1)).toEqual(order);
    expect(moveOpenStage(order, -1, 1)).toEqual(order);
    expect(moveOpenStage(order, 9, -1)).toEqual(order);
  });

  it("a ordem completa preserva as etapas de encerramento no lugar", () => {
    // Só as abertas trocam entre si: ganho e perda continuam nas posições 4 e 5.
    expect(fullStageOrder(stages, ["c", "a", "b"])).toEqual(["c", "a", "b", "won", "lost"]);
    expect(fullStageOrder(stages, ["a", "b", "c"])).toEqual(["a", "b", "c", "won", "lost"]);
  });

  it("a ordem completa mantém todas as etapas, sem perder nem duplicar", () => {
    const order = fullStageOrder(stages, ["b", "c", "a"]);
    expect(order).toHaveLength(stages.length);
    expect(new Set(order).size).toBe(stages.length);
  });

  it("detecta se a ordem mudou em relação ao servidor", () => {
    expect(orderChanged(["a", "b", "c"], ["a", "b", "c"])).toBe(false);
    expect(orderChanged(["a", "b", "c"], ["b", "a", "c"])).toBe(true);
    expect(orderChanged(["a", "b"], ["a", "b", "c"])).toBe(true);
  });
});

describe("proteções de arquivamento", () => {
  const defaultPipeline = pipeline({ id: "default", isDefault: true });
  const secondary = pipeline({ id: "secondary" });
  const archived = pipeline({ archived: true, id: "old" });

  it("o pipeline padrão nunca é arquivável", () => {
    const all = [defaultPipeline, secondary];
    expect(canArchivePipeline(defaultPipeline, all)).toBe(false);
    expect(archiveBlockedReason(defaultPipeline, all)).toContain("padrão");
  });

  it("o último pipeline ativo nunca é arquivável", () => {
    const all = [secondary, archived];
    expect(canArchivePipeline(secondary, all)).toBe(false);
    expect(archiveBlockedReason(secondary, all)).toContain("último pipeline ativo");
  });

  it("com outro pipeline ativo, o não padrão pode ser arquivado", () => {
    const all = [defaultPipeline, secondary];
    expect(canArchivePipeline(secondary, all)).toBe(true);
    expect(archiveBlockedReason(secondary, all)).toBeNull();
  });

  it("um pipeline já arquivado não é arquivado de novo", () => {
    const all = [defaultPipeline, secondary, archived];
    expect(canArchivePipeline(archived, all)).toBe(false);
    expect(archiveBlockedReason(archived, all)).toContain("já está arquivado");
  });

  it("o motivo do bloqueio é texto para pessoas, sem termo técnico", () => {
    const all = [defaultPipeline, secondary, archived];
    for (const item of all) {
      const reason = archiveBlockedReason(item, all);
      if (reason === null) continue;
      expect(reason).not.toMatch(/P42\d\d|SQLSTATE|rpc|constraint|archived_at/i);
    }
  });
});
