import type { ReactNode } from "react";

import { formatBrlFromCents } from "@/shared/lib/currency";
import { formatMinutesAsDuration } from "@/shared/lib/duration";
import { ColorIndicator } from "@/shared/ui/color-indicator";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { StatusBadge } from "@/shared/ui/status-badge";
import { Tabs, type TabDefinition } from "@/shared/ui/tabs";

import {
  agendaColor,
  effectiveDurationMinutes,
  effectivePriceCents,
  hasAnyOverride,
  optionalText,
  statusLabel,
  statusTone,
  type ProfessionalDetailView,
  type ProfessionalProcedureView,
} from "./operations-view-models";
import { WeeklyAvailabilitySummary } from "./weekly-availability-editor";

function DefinitionRow({ term, children }: { term: string; children: ReactNode }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
    <dt className="text-sm font-medium">{term}</dt>
    <dd className="min-w-0 text-sm text-muted-foreground">{children}</dd>
  </div>;
}

/**
 * Detalhe do profissional em abas. Componente puro de apresentação: recebe o
 * profissional e os procedimentos já resolvidos e não busca nada.
 *
 * A aba "Histórico" existe apenas como estrutura: atendimentos ainda não são um
 * conceito do sistema, então ela declara isso em vez de inventar registros.
 */
export function ProfessionalDetail({
  professional,
  procedures = [],
  actions,
  showHistoryTab = true,
  defaultTabKey,
}: {
  professional: ProfessionalDetailView;
  /** `null` quando a leitura falhou — diferente de `[]`, que é "nenhum habilitado". */
  procedures?: readonly ProfessionalProcedureView[] | null;
  actions?: ReactNode;
  showHistoryTab?: boolean;
  /** Aba aberta ao montar. Sem valor, abre a primeira. */
  defaultTabKey?: string;
}) {
  const color = agendaColor(professional.colorToken);

  const informationTab = <dl className="divide-y divide-border rounded-lg border border-border bg-surface">
    <DefinitionRow term="Nome de exibição">{professional.displayName}</DefinitionRow>
    <DefinitionRow term="Situação">
      <StatusBadge tone={statusTone(professional.status)}>{statusLabel(professional.status)}</StatusBadge>
    </DefinitionRow>
    <DefinitionRow term="E-mail">{professional.email ?? "Não informado"}</DefinitionRow>
    <DefinitionRow term="Telefone">{professional.phoneLabel ?? "Não informado"}</DefinitionRow>
    <DefinitionRow term="Registro profissional">
      {professional.registrationType && professional.registrationNumber
        ? `${professional.registrationType} ${professional.registrationNumber}`
        : "Não informado"}
    </DefinitionRow>
    <DefinitionRow term="Cor da agenda">
      <ColorIndicator color={color.cssValue} label={color.label} />
    </DefinitionRow>
    <DefinitionRow term="Usuário vinculado">
      {professional.linkedUserName ?? "Sem conta vinculada"}
    </DefinitionRow>
    <DefinitionRow term="Observações">{professional.notes ?? "Sem observações"}</DefinitionRow>
  </dl>;

  const specialtiesTab = professional.specialties.length === 0
    ? <EmptyState
      description="As especialidades ajudam a filtrar profissionais nas listas e na agenda."
      title="Nenhuma especialidade cadastrada"
    />
    : <ul aria-label="Especialidades do profissional" className="flex flex-wrap gap-1.5">
      {professional.specialties.map((specialty) => <li key={specialty}>
        <StatusBadge>{specialty}</StatusBadge>
      </li>)}
    </ul>;

  const proceduresTab = procedures === null
    ? <ErrorState
      description="Tente novamente em alguns instantes. Nada foi alterado."
      title="Não foi possível carregar os procedimentos habilitados"
    />
    : procedures.length === 0
    ? <EmptyState
      description="Habilite o profissional nos procedimentos que ele realiza para liberar o agendamento."
      title="Nenhum procedimento habilitado"
    />
    : <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {procedures.map((procedure) => <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5" key={procedure.procedureId}>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{procedure.name}</span>
        {procedure.category ? <StatusBadge>{procedure.category}</StatusBadge> : null}
        <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
          {formatMinutesAsDuration(effectiveDurationMinutes(procedure.baseDurationMinutes, procedure.durationOverrideMinutes))}
        </span>
        <span className="whitespace-nowrap text-sm font-medium tabular-nums">
          {formatBrlFromCents(effectivePriceCents(procedure.basePriceCents, procedure.priceOverrideCents))}
        </span>
        {hasAnyOverride(procedure)
          ? <StatusBadge tone="accent">Personalizado</StatusBadge>
          : <span className="text-xs text-muted-foreground">Usa o padrão</span>}
      </li>)}
    </ul>;

  const historyTab = <EmptyState
    description="Os atendimentos ainda não fazem parte do sistema. Quando existirem, o histórico do profissional aparece aqui."
    title="Histórico ainda não disponível"
  />;

  // Semana ausente é leitura que falhou, nunca "sem atendimento": o resumo dá
  // lugar a um estado de erro que diz o que aconteceu e o que fazer.
  const availabilityTab = professional.availability === undefined
    ? <ErrorState
      description="Os horários deste profissional não puderam ser lidos agora. Atualize a página para tentar de novo. Nada foi alterado."
      title="Não foi possível carregar os horários"
    />
    : <WeeklyAvailabilitySummary availability={professional.availability} />;

  const tabs: readonly TabDefinition[] = [
    { content: informationTab, key: "info", label: "Informações" },
    { content: specialtiesTab, count: professional.specialties.length, key: "specialties", label: "Especialidades" },
    { content: availabilityTab, key: "availability", label: "Disponibilidade" },
    {
      content: proceduresTab,
      ...(procedures === null ? {} : { count: procedures.length }),
      key: "procedures",
      label: "Procedimentos",
    },
    ...(showHistoryTab ? [{ content: historyTab, key: "history", label: "Histórico" } as const] : []),
  ];

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold tracking-tight">{professional.displayName}</h2>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{optionalText(professional.availabilityLabel, "Nenhum horário definido")}</span>
          <span aria-hidden="true">•</span>
          <span>
            {procedures === null
              ? "Procedimentos habilitados não carregados"
              : `${procedures.length} procedimento(s) habilitado(s)`}
          </span>
        </p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
    <Tabs defaultTabKey={defaultTabKey} label="Seções do profissional" tabs={tabs} />
  </div>;
}
