"use client";

import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { stageAccent } from "@/shared/ui/stage-accent";
import { StatusBadge } from "@/shared/ui/status-badge";
import { SubmitButton } from "@/shared/ui/submit-button";

import {
  fullStageOrder,
  moveOpenStage,
  orderChanged,
  stageKindLabel,
  stageKindTone,
  type PipelineStageView,
} from "./pipeline-view-models";

/**
 * Ordenação das etapas abertas.
 *
 * Somente as etapas abertas são permutadas; ganho e perda ficam nas posições
 * originais, porque a ordem delas não é uma escolha da clínica. O envio leva a
 * lista completa que o contrato exige, montada a partir da ordem do servidor —
 * salvar a ordem não altera nome nenhum, e salvar um nome não altera a ordem.
 *
 * Enquanto nada é movido o botão fica desabilitado, então não existe envio que
 * "salve" sem mudar nada. Se a gravação falhar, a página recarrega o estado
 * real do servidor e a ordem anterior continua valendo.
 */
export function StageOrderEditor({ pipelineId, stages, action, disabled = false }: {
  pipelineId: string;
  stages: readonly PipelineStageView[];
  /** A ação chega por prop: o componente não conhece módulo, RPC nem banco. */
  action: (formData: FormData) => void | Promise<void>;
  /** Sem `pipeline.manage` a lista continua legível, mas não editável. */
  disabled?: boolean;
}) {
  const initialOpenIds = stages.filter((stage) => stage.kind === "open").map((stage) => stage.id);
  const [openIds, setOpenIds] = useState<readonly string[]>(initialOpenIds);

  // Quando o servidor devolve outra ordem (após salvar, ou por alteração de
  // outra pessoa), o rascunho volta a espelhar o que está gravado.
  const signature = initialOpenIds.join(",");
  const [syncedSignature, setSyncedSignature] = useState(signature);
  if (syncedSignature !== signature) {
    setSyncedSignature(signature);
    setOpenIds(initialOpenIds);
  }

  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const closingStages = stages.filter((stage) => stage.kind !== "open");
  const dirty = orderChanged(initialOpenIds, openIds);

  function move(index: number, direction: -1 | 1) {
    setOpenIds((current) => moveOpenStage(current, index, direction));
  }

  return <div className="space-y-3">
    {openIds.length === 0
      ? <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
        Este pipeline ainda não tem etapas abertas. Crie a primeira para começar a mover oportunidades.
      </p>
      : <ol className="divide-y divide-border rounded-lg border border-border bg-surface">
        {openIds.map((id, index) => {
          const stage = byId.get(id);
          if (!stage) return null;
          return <li className="flex flex-wrap items-center gap-2 px-3 py-2.5" key={id}>
            <GripVertical aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: stageAccent("open", index) }}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{stage.name}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{index + 1}º</span>
            <span aria-label={`Reordenar ${stage.name}`} className="flex items-center gap-1" role="group">
              <Button
                aria-label={`Mover ${stage.name} para cima`}
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
                size="icon"
                type="button"
                variant="outline"
              >
                <ChevronUp aria-hidden="true" />
              </Button>
              <Button
                aria-label={`Mover ${stage.name} para baixo`}
                disabled={disabled || index === openIds.length - 1}
                onClick={() => move(index, 1)}
                size="icon"
                type="button"
                variant="outline"
              >
                <ChevronDown aria-hidden="true" />
              </Button>
            </span>
          </li>;
        })}
      </ol>}

    {closingStages.length > 0 ? <ul className="divide-y divide-border rounded-lg border border-border bg-surface-subtle">
      {closingStages.map((stage) => <li className="flex flex-wrap items-center gap-2 px-3 py-2" key={stage.id}>
        <span className="min-w-0 flex-1 truncate text-sm">{stage.name}</span>
        <StatusBadge tone={stageKindTone(stage.kind)}>{stageKindLabel(stage.kind)}</StatusBadge>
      </li>)}
    </ul> : null}

    {disabled ? null : <form action={action} className="flex flex-wrap items-center justify-end gap-3">
      <input name="pipelineId" type="hidden" value={pipelineId} />
      <input name="stageIds" type="hidden" value={fullStageOrder(stages, openIds).join(",")} />
      <p className="me-auto text-xs text-muted-foreground" role="status">
        {dirty ? "Ordem alterada — salve para aplicar." : "Ordem sincronizada com o servidor."}
      </p>
      <SubmitButton disabled={!dirty} pendingLabel="Salvando ordem…" size="sm">Salvar ordem</SubmitButton>
    </form>}

    <p className="text-xs text-muted-foreground">
      As etapas de ganho e perda são definidas pelo sistema: podem ser renomeadas, mas não mudam de
      posição nem de tipo.
    </p>
  </div>;
}
