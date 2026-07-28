import Link from "next/link";

import { Input } from "@/shared/ui/input";
import { StatusBadge } from "@/shared/ui/status-badge";
import { SubmitButton } from "@/shared/ui/submit-button";

import { statusLabel, statusTone, type LeadRow } from "../../_components/opportunity-view";
import { closeOpportunityFormAction, moveOpportunityFormAction } from "../actions";

type MoveTarget = { readonly id: string; readonly name: string };

/**
 * Card compacto de oportunidade. Todas as ações usam as Server Actions já
 * existentes e mantêm `expectedVersion`; a movimentação continua disponível
 * por `select` acessível, sem depender de arrastar e soltar.
 */
export function KanbanCard({ card, clinicId, closeAllowed, moveTargets, version }: {
  card: LeadRow;
  clinicId: string;
  closeAllowed: boolean;
  moveTargets: readonly MoveTarget[];
  version: number;
}) {
  return <article className="rounded-md border border-border bg-surface p-2.5 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow">
    <div className="flex items-start justify-between gap-2">
      <Link
        className="min-w-0 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        href={card.href}
      >
        {card.title}
      </Link>
      {card.amountLabel ? <span className="shrink-0 text-sm font-semibold tabular-nums">{card.amountLabel}</span> : null}
    </div>
    <p className="mt-0.5 truncate text-xs text-muted-foreground">{card.contactName}</p>

    <div className="mt-2 flex flex-wrap items-center gap-1">
      <StatusBadge tone={statusTone(card.status)}>{statusLabel(card.status)}</StatusBadge>
      {card.sourceName ? <StatusBadge>{card.sourceName}</StatusBadge> : null}
    </div>

    <dl className="mt-2 grid gap-0.5 text-xs text-muted-foreground">
      <div className="truncate"><dt className="inline font-medium">Responsável: </dt><dd className="inline">{card.assigneeName}</dd></div>
      <div className="truncate"><dt className="inline font-medium">Atualizado: </dt><dd className="inline">{card.updatedLabel}</dd></div>
    </dl>

    <details className="group mt-2 border-t border-border pt-2">
      <summary className="cursor-pointer list-none text-xs font-medium text-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span className="group-open:hidden">Ações rápidas</span>
        <span className="hidden group-open:inline">Fechar ações</span>
      </summary>

      <form action={moveOpportunityFormAction} className="mt-2 space-y-1.5">
        <input name="clinicId" type="hidden" value={clinicId} />
        <input name="opportunityId" type="hidden" value={card.id} />
        <input name="expectedVersion" type="hidden" value={version} />
        <input name="returnTo" type="hidden" value="pipeline" />
        <label className="block text-xs font-medium" htmlFor={`move-${card.id}`}>Mover para etapa
          <select
            className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            defaultValue=""
            id={`move-${card.id}`}
            name="targetStageId"
            required
          >
            <option disabled value="">Selecione</option>
            {moveTargets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
          </select>
        </label>
        <SubmitButton pendingLabel="Movendo…" size="sm" variant="outline">Mover</SubmitButton>
      </form>

      {closeAllowed ? <div className="mt-2 space-y-2 border-t border-border pt-2">
        <form action={closeOpportunityFormAction}>
          <input name="clinicId" type="hidden" value={clinicId} />
          <input name="opportunityId" type="hidden" value={card.id} />
          <input name="expectedVersion" type="hidden" value={version} />
          <input name="targetStatus" type="hidden" value="won" />
          <input name="returnTo" type="hidden" value="pipeline" />
          <SubmitButton pendingLabel="Fechando…" size="sm">Marcar como ganha</SubmitButton>
        </form>
        <form action={closeOpportunityFormAction} className="space-y-1.5">
          <input name="clinicId" type="hidden" value={clinicId} />
          <input name="opportunityId" type="hidden" value={card.id} />
          <input name="expectedVersion" type="hidden" value={version} />
          <input name="targetStatus" type="hidden" value="lost" />
          <input name="returnTo" type="hidden" value="pipeline" />
          <label className="block text-xs font-medium" htmlFor={`lost-${card.id}`}>Motivo da perda
            <Input className="mt-1 h-8" id={`lost-${card.id}`} maxLength={500} minLength={2} name="closeReason" required />
          </label>
          <SubmitButton pendingLabel="Fechando…" size="sm" variant="destructive">Marcar como perdida</SubmitButton>
        </form>
      </div> : null}
    </details>
  </article>;
}
