"use client";

import { ChevronDown, ChevronUp, GripVertical, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { stageAccent } from "@/shared/ui/stage-accent";
import { StatusBadge } from "@/shared/ui/status-badge";
import { SubmitButton } from "@/shared/ui/submit-button";

import {
  createPipelineStageFormAction,
  reorderPipelineStagesFormAction,
  updatePipelineStageFormAction,
} from "../../pipeline/actions";

type Stage = { readonly id: string; readonly name: string; readonly stage_kind: string };

function StageNameForm({ clinicId, stage, accent, badge }: {
  clinicId: string;
  stage: Stage;
  accent: string;
  badge?: { readonly label: string; readonly tone: "success" | "danger" };
}) {
  return <form action={updatePipelineStageFormAction} className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
    <input name="clinicId" type="hidden" value={clinicId} />
    <input name="pipelineStageId" type="hidden" value={stage.id} />
    <input name="returnTo" type="hidden" value="settings" />
    <span aria-hidden="true" className="mb-2.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
    <label className="min-w-40 flex-1 text-xs font-medium text-muted-foreground" htmlFor={`stage-name-${stage.id}`}>
      Nome da etapa
      <Input className="mt-1" defaultValue={stage.name} id={`stage-name-${stage.id}`} maxLength={60} name="name" required />
    </label>
    {badge ? <StatusBadge className="mb-2" tone={badge.tone}>{badge.label}</StatusBadge> : null}
    <SubmitButton pendingLabel="Salvando…" size="sm" variant="outline">Salvar nome</SubmitButton>
  </form>;
}

/**
 * Editor das etapas do pipeline padrão. Espelha as regras do backend sem
 * reimplementá-las: `stage_kind` é imutável, novas etapas nascem abertas, as
 * etapas de ganho e perda são únicas e não podem ser excluídas por aqui.
 * A reordenação envia sempre a lista completa exigida pela RPC.
 */
export function StageEditor({ clinicId, stages }: { clinicId: string; stages: readonly Stage[] }) {
  const initialOpenIds = useMemo(
    () => stages.filter((stage) => stage.stage_kind === "open").map((stage) => stage.id),
    [stages],
  );
  const [openIds, setOpenIds] = useState<readonly string[]>(initialOpenIds);
  const [adding, setAdding] = useState(false);
  const byId = useMemo(() => new Map(stages.map((stage) => [stage.id, stage])), [stages]);
  const closingStages = stages.filter((stage) => stage.stage_kind !== "open");
  const dirty = openIds.some((id, index) => id !== initialOpenIds[index]);

  // Mantém as etapas de encerramento exatamente nas posições originais e
  // apenas permuta as etapas abertas entre si.
  const fullOrder = useMemo(() => {
    let cursor = 0;
    return stages.map((stage) => stage.stage_kind === "open" ? openIds[cursor++] ?? stage.id : stage.id);
  }, [openIds, stages]);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= openIds.length) return;
    setOpenIds((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  return <div className="space-y-6">
    <section aria-labelledby="open-stages-title" className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold" id="open-stages-title">Etapas abertas</h2>
          <p className="text-xs text-muted-foreground">Percurso das oportunidades em andamento. A ordem define as colunas do quadro.</p>
        </div>
        <Button onClick={() => setAdding((value) => !value)} size="sm" type="button" variant="outline">
          <Plus aria-hidden="true" />
          Adicionar etapa
        </Button>
      </div>

      <ul className="divide-y divide-border">
        {openIds.map((id, index) => {
          const stage = byId.get(id);
          if (!stage) return null;
          return <li className="flex flex-wrap items-end gap-2 px-4 py-3" key={id}>
            <GripVertical aria-hidden="true" className="mb-2.5 size-4 shrink-0 text-muted-foreground" />
            <StageNameForm accent={stageAccent("open", index)} clinicId={clinicId} stage={stage} />
            <div aria-label={`Reordenar ${stage.name}`} className="mb-0.5 flex items-center gap-1" role="group">
              <Button
                aria-label={`Mover ${stage.name} para cima`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
                size="icon"
                type="button"
                variant="outline"
              >
                <ChevronUp aria-hidden="true" />
              </Button>
              <Button
                aria-label={`Mover ${stage.name} para baixo`}
                disabled={index === openIds.length - 1}
                onClick={() => move(index, 1)}
                size="icon"
                type="button"
                variant="outline"
              >
                <ChevronDown aria-hidden="true" />
              </Button>
            </div>
          </li>;
        })}
      </ul>

      {adding ? <form action={createPipelineStageFormAction} className="flex flex-wrap items-end gap-2 border-t border-border bg-surface-subtle px-4 py-3">
        <input name="clinicId" type="hidden" value={clinicId} />
        <input name="returnTo" type="hidden" value="settings" />
        <label className="min-w-48 flex-1 text-xs font-medium text-muted-foreground" htmlFor="new-stage-name">
          Nova etapa (sempre criada como aberta)
          <Input autoFocus className="mt-1" id="new-stage-name" maxLength={60} name="name" required />
        </label>
        <SubmitButton pendingLabel="Criando…" size="sm">Criar etapa</SubmitButton>
        <Button onClick={() => setAdding(false)} size="sm" type="button" variant="ghost">Cancelar</Button>
      </form> : null}

      <form action={reorderPipelineStagesFormAction} className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-4 py-3">
        <input name="clinicId" type="hidden" value={clinicId} />
        <input name="returnTo" type="hidden" value="settings" />
        <input name="stageIds" type="hidden" value={fullOrder.join(",")} />
        <p className="me-auto text-xs text-muted-foreground" role="status">
          {dirty ? "Ordem alterada — salve para aplicar." : "Ordem sincronizada com o servidor."}
        </p>
        <SubmitButton disabled={!dirty} pendingLabel="Salvando ordem…" size="sm">Salvar ordem</SubmitButton>
      </form>
    </section>

    <section aria-labelledby="closing-stages-title" className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold" id="closing-stages-title">Encerramento</h2>
        <p className="text-xs text-muted-foreground">Etapas de ganho e perda são únicas, não podem ser reordenadas nem removidas por aqui — apenas renomeadas.</p>
      </div>
      <ul className="divide-y divide-border">
        {closingStages.map((stage) => <li className="flex flex-wrap items-end gap-2 px-4 py-3" key={stage.id}>
          <StageNameForm
            accent={stageAccent(stage.stage_kind)}
            badge={stage.stage_kind === "won"
              ? { label: "Ganha", tone: "success" }
              : { label: "Perdida", tone: "danger" }}
            clinicId={clinicId}
            stage={stage}
          />
        </li>)}
        {closingStages.length === 0
          ? <li className="px-4 py-3 text-sm text-muted-foreground">Nenhuma etapa de encerramento configurada.</li>
          : null}
      </ul>
    </section>
  </div>;
}
