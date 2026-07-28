"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { SubmitButton } from "@/shared/ui/submit-button";

import {
  createPipelineStageFormAction,
  reorderPipelineStagesFormAction,
  updatePipelineStageFormAction,
} from "./actions";

type Stage = { id: string; name: string; stage_kind: string };

export function StageManager({ clinicId, initialStages }: {
  clinicId: string;
  initialStages: readonly Stage[];
}) {
  const [stages, setStages] = useState([...initialStages]);
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    setStages((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }
  return <section className="space-y-4 rounded-lg border bg-background p-4">
    <div><h2 className="font-semibold">Configurar etapas</h2><p className="text-sm text-muted-foreground">Alterações exigem MFA. O tipo open/won/lost não pode ser modificado.</p></div>
    <ul className="space-y-2">
      {stages.map((stage, index) => <li className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_auto]" key={stage.id}>
        <form action={updatePipelineStageFormAction} className="flex flex-wrap items-end gap-2">
          <input name="clinicId" type="hidden" value={clinicId} />
          <input name="pipelineStageId" type="hidden" value={stage.id} />
          <label className="min-w-48 flex-1 text-sm" htmlFor={`stage-${stage.id}`}>Nome ({stage.stage_kind})
            <Input defaultValue={stage.name} id={`stage-${stage.id}`} name="name" required />
          </label>
          <SubmitButton pendingLabel="Atualizando…" size="sm" variant="outline">Atualizar</SubmitButton>
        </form>
        <div className="flex items-center gap-1" role="group" aria-label={`Reordenar ${stage.name}`}>
          <Button aria-label={`Mover ${stage.name} para cima`} disabled={index === 0} onClick={() => move(index, -1)} size="sm" type="button" variant="outline">↑</Button>
          <Button aria-label={`Mover ${stage.name} para baixo`} disabled={index === stages.length - 1} onClick={() => move(index, 1)} size="sm" type="button" variant="outline">↓</Button>
        </div>
      </li>)}
    </ul>
    <form action={reorderPipelineStagesFormAction} className="flex justify-end">
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="stageIds" type="hidden" value={stages.map((stage) => stage.id).join(",")} />
      <SubmitButton pendingLabel="Salvando ordem…">Salvar ordem completa</SubmitButton>
    </form>
    <form action={createPipelineStageFormAction} className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-end">
      <input name="clinicId" type="hidden" value={clinicId} />
      <label className="flex-1 text-sm" htmlFor="new-stage-name">Nova etapa aberta
        <Input id="new-stage-name" maxLength={60} name="name" required />
      </label>
      <SubmitButton pendingLabel="Criando…">Criar etapa</SubmitButton>
    </form>
  </section>;
}
