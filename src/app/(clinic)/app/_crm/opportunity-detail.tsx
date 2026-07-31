import type { ReactNode } from "react";
import Link from "next/link";

import { formatBrlFromCents } from "@/shared/lib/currency";
import { EmptyState } from "@/shared/ui/empty-state";
import { StatusBadge } from "@/shared/ui/status-badge";

import {
  opportunityStatusLabel,
  opportunityStatusTone,
  type OpportunityStatus,
  type StageEventView,
} from "./crm-view-models";

export type OpportunityDetailView = {
  readonly id: string;
  readonly title: string;
  readonly status: OpportunityStatus;
  readonly contactName: string | null;
  readonly contactHref: string | null;
  readonly pipelineName: string | null;
  readonly stageName: string | null;
  readonly assigneeName: string | null;
  readonly sourceName: string | null;
  readonly amountCents: number | null;
  readonly createdAtLabel: string;
  readonly updatedAtLabel: string;
  readonly closedAtLabel: string | null;
  readonly closeReason: string | null;
};

function DefinitionCard({ term, children }: { term: string; children: ReactNode }) {
  return <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
    <dt className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">{term}</dt>
    <dd className="mt-0.5 text-sm font-medium">{children}</dd>
  </div>;
}

/**
 * Resumo da oportunidade.
 *
 * Componente puro de apresentação. Cada campo vem resolvido do servidor; onde o
 * contrato não informa (pipeline ou etapa removida, por exemplo), a tela diz
 * "—" em vez de exibir um identificador cru ou um nome inventado.
 */
export function OpportunitySummary({ opportunity }: { opportunity: OpportunityDetailView }) {
  return <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
    <DefinitionCard term="Situação">
      <StatusBadge tone={opportunityStatusTone(opportunity.status)}>
        {opportunityStatusLabel(opportunity.status)}
      </StatusBadge>
    </DefinitionCard>
    <DefinitionCard term="Contato">
      {opportunity.contactName && opportunity.contactHref
        ? <Link
          className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          href={opportunity.contactHref}
        >
          {opportunity.contactName}
        </Link>
        : <span className="text-muted-foreground">—</span>}
    </DefinitionCard>
    <DefinitionCard term="Pipeline">
      {opportunity.pipelineName ?? <span className="text-muted-foreground">—</span>}
    </DefinitionCard>
    <DefinitionCard term="Etapa">
      {opportunity.stageName ?? <span className="text-muted-foreground">—</span>}
    </DefinitionCard>
    <DefinitionCard term="Responsável">
      {opportunity.assigneeName ?? <span className="text-muted-foreground">Sem responsável</span>}
    </DefinitionCard>
    <DefinitionCard term="Origem">
      {opportunity.sourceName ?? <span className="text-muted-foreground">Sem origem</span>}
    </DefinitionCard>
    <DefinitionCard term="Valor">
      <span className="tabular-nums">
        {opportunity.amountCents === null
          ? <span className="font-normal text-muted-foreground">Não informado</span>
          : formatBrlFromCents(opportunity.amountCents)}
      </span>
    </DefinitionCard>
    <DefinitionCard term="Criada em">
      <span className="font-normal tabular-nums text-muted-foreground">{opportunity.createdAtLabel}</span>
    </DefinitionCard>
    <DefinitionCard term="Atualizada em">
      <span className="font-normal tabular-nums text-muted-foreground">{opportunity.updatedAtLabel}</span>
    </DefinitionCard>
    {opportunity.closedAtLabel ? <DefinitionCard term="Fechada em">
      <span className="font-normal tabular-nums text-muted-foreground">{opportunity.closedAtLabel}</span>
    </DefinitionCard> : null}
    {opportunity.status === "lost" || opportunity.closeReason ? <DefinitionCard term="Motivo do fechamento">
      <span className="font-normal text-muted-foreground">{opportunity.closeReason ?? "—"}</span>
    </DefinitionCard> : null}
  </dl>;
}

/**
 * Histórico de movimentações, do mais recente para o mais antigo. Os nomes de
 * etapa já chegam resolvidos — nenhum identificador aparece na tela.
 */
export function OpportunityHistory({ events }: { events: readonly StageEventView[] }) {
  if (events.length === 0) {
    return <EmptyState
      description="As mudanças de etapa e de situação desta oportunidade aparecem aqui."
      title="Nenhuma movimentação registrada"
    />;
  }
  return <ol className="divide-y divide-border rounded-lg border border-border bg-surface">
    {events.map((event) => <li className="px-3 py-2.5" key={event.id}>
      <p className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="font-medium">{event.fromLabel}</span>
        <span aria-hidden="true" className="text-muted-foreground">→</span>
        <span className="font-medium">{event.toLabel}</span>
      </p>
      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
        {event.occurredAtLabel}
        {event.reason ? <span className="tabular-nums-none"> — {event.reason}</span> : null}
      </p>
    </li>)}
  </ol>;
}
