import type { ReactNode } from "react";

import { formatBrlFromCents } from "@/shared/lib/currency";
import { formatMinutesAsDuration } from "@/shared/lib/duration";
import { ColorIndicator } from "@/shared/ui/color-indicator";
import { EmptyState } from "@/shared/ui/empty-state";
import { StatusBadge } from "@/shared/ui/status-badge";

import {
  agendaColor,
  countEnabledLinks,
  effectiveDurationMinutes,
  effectivePriceCents,
  hasAnyOverride,
  statusLabel,
  statusTone,
  type ProcedureDetailView,
  type ProcedureProfessionalLinkView,
} from "./operations-view-models";

/**
 * Detalhe do procedimento: resumo, profissionais habilitados e as
 * personalizações em vigor. Componente puro de apresentação.
 *
 * Não há métrica financeira aqui — nem faturamento, nem custo, nem margem.
 */
export function ProcedureDetail({
  procedure,
  links = [],
  actions,
}: {
  procedure: ProcedureDetailView;
  links?: readonly ProcedureProfessionalLinkView[];
  actions?: ReactNode;
}) {
  const color = agendaColor(procedure.colorToken);
  const enabled = links.filter((link) => link.enabled);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold tracking-tight">{procedure.name}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{procedure.category ?? "Sem categoria"}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>

    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
        <dt className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">Duração padrão</dt>
        <dd className="mt-0.5 text-sm font-semibold tabular-nums">{formatMinutesAsDuration(procedure.durationMinutes)}</dd>
      </div>
      <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
        <dt className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">Preço-base</dt>
        <dd className="mt-0.5 text-sm font-semibold tabular-nums">{formatBrlFromCents(procedure.basePriceCents)}</dd>
      </div>
      <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
        <dt className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">Situação</dt>
        <dd className="mt-0.5"><StatusBadge tone={statusTone(procedure.status)}>{statusLabel(procedure.status)}</StatusBadge></dd>
      </div>
      <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
        <dt className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">Cor na agenda</dt>
        <dd className="mt-0.5"><ColorIndicator color={color.cssValue} label={color.label} /></dd>
      </div>
    </dl>

    <section aria-labelledby="procedure-description" className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <h3 className="text-sm font-semibold" id="procedure-description">Descrição</h3>
      <p className="mt-1 text-sm text-muted-foreground">{procedure.description ?? "Sem descrição cadastrada."}</p>
    </section>

    <section aria-labelledby="procedure-professionals" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold" id="procedure-professionals">Profissionais habilitados</h3>
        <p className="text-xs text-muted-foreground">{countEnabledLinks(links)} de {links.length}</p>
      </div>
      {enabled.length === 0
        ? <EmptyState
          description="Habilite ao menos um profissional para que este procedimento possa ser agendado."
          title="Nenhum profissional habilitado"
        />
        : <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {enabled.map((link) => <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5" key={link.professionalId}>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{link.displayName}</span>
            <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
              {formatMinutesAsDuration(effectiveDurationMinutes(procedure.durationMinutes, link.durationOverrideMinutes))}
            </span>
            <span className="whitespace-nowrap text-sm font-medium tabular-nums">
              {formatBrlFromCents(effectivePriceCents(procedure.basePriceCents, link.priceOverrideCents))}
            </span>
            {hasAnyOverride(link)
              ? <StatusBadge tone="accent">Personalizado</StatusBadge>
              : <span className="text-xs text-muted-foreground">Usa o padrão</span>}
          </li>)}
        </ul>}
    </section>
  </div>;
}
