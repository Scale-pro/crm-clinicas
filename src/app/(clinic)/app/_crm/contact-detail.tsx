import type { ReactNode } from "react";
import Link from "next/link";

import { formatBrlFromCents } from "@/shared/lib/currency";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { StatusBadge } from "@/shared/ui/status-badge";
import { Tabs, type TabDefinition } from "@/shared/ui/tabs";

import {
  contactMethodKindLabel,
  opportunityStatusLabel,
  opportunityStatusTone,
  optionalText,
  sortContactMethods,
  type ContactMethodView,
  type OpportunityRowView,
} from "./crm-view-models";

export type ContactActivityView = {
  readonly id: string;
  readonly label: string;
  readonly occurredAtLabel: string;
};

export type ContactDetailView = {
  readonly id: string;
  readonly fullName: string;
  readonly ownerName: string | null;
  readonly createdAtLabel: string;
  readonly updatedAtLabel: string;
  readonly notes: string | null;
  readonly archived: boolean;
  readonly isPatient: boolean;
  readonly patientSinceLabel: string | null;
  readonly methods: readonly ContactMethodView[];
};

function DefinitionRow({ term, children }: { term: string; children: ReactNode }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
    <dt className="text-sm font-medium">{term}</dt>
    <dd className="min-w-0 text-sm text-muted-foreground">{children}</dd>
  </div>;
}

/** Meios de contato de um tipo, com o principal e o WhatsApp marcados em texto. */
function MethodList({ items, emptyLabel, showKind = false }: {
  items: readonly ContactMethodView[];
  emptyLabel: string;
  showKind?: boolean;
}) {
  if (items.length === 0) return <span className="text-sm text-muted-foreground">{emptyLabel}</span>;
  return <ul className="flex flex-col items-end gap-1">
    {items.map((method) => <li className="flex flex-wrap items-center justify-end gap-1.5" key={method.id}>
      {showKind ? <span className="text-xs text-muted-foreground">{contactMethodKindLabel(method.kind)}</span> : null}
      <span className="text-sm">{method.displayValue}</span>
      {method.label ? <span className="text-xs text-muted-foreground">({method.label})</span> : null}
      {method.isPrimary ? <StatusBadge tone="accent">Principal</StatusBadge> : null}
      {method.isWhatsapp ? <StatusBadge>WhatsApp</StatusBadge> : null}
    </li>)}
  </ul>;
}

/**
 * Lead 360 — visão completa do contato em abas.
 *
 * Componente puro de apresentação: recebe tudo já resolvido pelo servidor e não
 * busca nada. Toda informação exibida vem de um contrato público; onde o
 * contrato não informa, a tela diz isso em vez de preencher.
 *
 * `opportunities === null` significa que a leitura falhou — diferente de `[]`,
 * que significa "este contato ainda não tem oportunidades".
 */
export function ContactDetail({
  contact,
  opportunities,
  opportunitiesNote,
  activities,
  actions,
  defaultTabKey,
}: {
  contact: ContactDetailView;
  opportunities: readonly OpportunityRowView[] | null;
  /** Aviso de escopo ou de possível incompletude da varredura. */
  opportunitiesNote?: string;
  activities: readonly ContactActivityView[];
  actions?: ReactNode;
  defaultTabKey?: string;
}) {
  const methods = sortContactMethods(contact.methods);
  const phones = methods.filter((method) => method.kind === "phone");
  const emails = methods.filter((method) => method.kind === "email");
  const others = methods.filter((method) => method.kind === "other");

  // Origem é registrada por oportunidade (`opportunities.initial_source_id`);
  // o contato não tem campo próprio. Mostramos as origens reais das
  // oportunidades dele em vez de inventar uma origem de contato.
  const sources = opportunities === null
    ? null
    : [...new Set(opportunities.flatMap((item) => item.sourceName ? [item.sourceName] : []))];

  const summaryTab = <div className="space-y-3">
    <dl className="divide-y divide-border rounded-lg border border-border bg-surface">
      <DefinitionRow term="Nome">{contact.fullName}</DefinitionRow>
      <DefinitionRow term="Situação">
        {contact.archived
          ? <StatusBadge tone="neutral">Arquivado</StatusBadge>
          : <StatusBadge tone="success">Ativo</StatusBadge>}
      </DefinitionRow>
      <DefinitionRow term="Responsável">{contact.ownerName ?? "Sem responsável"}</DefinitionRow>
      <DefinitionRow term={`Telefones (${phones.length})`}>
        <MethodList emptyLabel="Nenhum telefone cadastrado" items={phones} />
      </DefinitionRow>
      <DefinitionRow term={`E-mails (${emails.length})`}>
        <MethodList emptyLabel="Nenhum e-mail cadastrado" items={emails} />
      </DefinitionRow>
      {others.length > 0 ? <DefinitionRow term="Outros meios">
        <MethodList emptyLabel="Nenhum outro meio" items={others} showKind />
      </DefinitionRow> : null}
      <DefinitionRow term="Origem">
        {sources === null
          ? optionalText(undefined, "")
          : sources.length === 0
            ? "Nenhuma origem registrada nas oportunidades"
            : sources.join(", ")}
      </DefinitionRow>
      <DefinitionRow term="Paciente">
        {contact.isPatient
          ? contact.patientSinceLabel
            ? `Vinculado desde ${contact.patientSinceLabel}`
            : "Vinculado"
          : "Não vinculado"}
      </DefinitionRow>
      <DefinitionRow term="Criado em">{contact.createdAtLabel}</DefinitionRow>
      <DefinitionRow term="Atualizado em">{contact.updatedAtLabel}</DefinitionRow>
    </dl>

    <section aria-labelledby="contact-notes" className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <h3 className="text-sm font-semibold" id="contact-notes">Observações</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
        {contact.notes?.trim() ? contact.notes : "Nenhuma observação cadastrada."}
      </p>
    </section>
  </div>;

  const opportunitiesTab = opportunities === null
    ? <ErrorState
      description="Tente novamente em alguns instantes. Nada foi alterado."
      title="Não foi possível carregar as oportunidades deste contato"
    />
    : opportunities.length === 0
      ? <EmptyState
        description="Quando este contato tiver uma oportunidade, ela aparece aqui com pipeline, etapa e responsável."
        title="Nenhuma oportunidade para este contato"
      />
      : <div className="space-y-2">
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {opportunities.map((item) => <li className="px-3 py-2.5" key={item.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                className="min-w-0 truncate text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                href={item.href}
              >
                {item.title}
              </Link>
              <StatusBadge tone={opportunityStatusTone(item.status)}>
                {opportunityStatusLabel(item.status)}
              </StatusBadge>
            </div>
            <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="inline font-medium">Pipeline: </dt><dd className="inline">{item.pipelineName ?? "—"}</dd></div>
              <div><dt className="inline font-medium">Etapa: </dt><dd className="inline">{item.stageName ?? "—"}</dd></div>
              <div><dt className="inline font-medium">Responsável: </dt><dd className="inline">{item.assigneeName ?? "Sem responsável"}</dd></div>
              <div><dt className="inline font-medium">Valor: </dt><dd className="inline tabular-nums">{item.amountCents === null ? "Não informado" : formatBrlFromCents(item.amountCents)}</dd></div>
              <div><dt className="inline font-medium">Origem: </dt><dd className="inline">{item.sourceName ?? "Sem origem"}</dd></div>
              <div><dt className="inline font-medium">Atualizada em: </dt><dd className="inline">{item.updatedAtLabel}</dd></div>
            </dl>
          </li>)}
        </ul>
        {opportunitiesNote ? <p className="text-xs text-muted-foreground">{opportunitiesNote}</p> : null}
      </div>;

  const historyTab = activities.length === 0
    ? <EmptyState
      description="As alterações registradas neste contato aparecem aqui."
      title="Nenhuma atividade registrada"
    />
    : <ol className="divide-y divide-border rounded-lg border border-border bg-surface">
      {activities.map((activity) => <li className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2" key={activity.id}>
        <span className="text-sm font-medium">{activity.label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{activity.occurredAtLabel}</span>
      </li>)}
    </ol>;

  // Declaração honesta: o núcleo de WhatsApp não está na main. Nenhuma mensagem
  // é simulada aqui — a aba existe para dizer o que ainda não existe.
  const communicationTab = <section
    aria-live="polite"
    className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface p-8 text-center"
    role="status"
  >
    <h3 className="text-sm font-medium text-foreground">Conversas ainda não disponíveis</h3>
    <p className="max-w-md text-sm text-muted-foreground">
      O histórico de mensagens de WhatsApp ainda não faz parte desta versão do sistema. Assim que a
      integração entrar, as conversas deste contato aparecem aqui. Nenhuma mensagem é exibida antes
      disso — nem como exemplo.
    </p>
  </section>;

  const tabs: readonly TabDefinition[] = [
    { content: summaryTab, key: "summary", label: "Resumo" },
    {
      content: opportunitiesTab,
      ...(opportunities === null ? {} : { count: opportunities.length }),
      key: "opportunities",
      label: "Oportunidades",
    },
    { content: historyTab, count: activities.length, key: "history", label: "Histórico" },
    { content: communicationTab, key: "communication", label: "Comunicação" },
  ];

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold tracking-tight">{contact.fullName}</h2>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{contact.ownerName ?? "Sem responsável"}</span>
          <span aria-hidden="true">•</span>
          <span>
            {opportunities === null
              ? "Oportunidades não carregadas"
              : `${opportunities.length} oportunidade(s)`}
          </span>
        </p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
    <Tabs defaultTabKey={defaultTabKey} label="Seções do contato" tabs={tabs} />
  </div>;
}
