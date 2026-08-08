import type { ReactNode } from "react";
import Link from "next/link";

import {
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
} from "@/shared/ui/data-table";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingTable } from "@/shared/ui/loading-table";
import { StatusBadge } from "@/shared/ui/status-badge";

import { UNKNOWN_FIELD_LABEL, type ContactRowView, type CrmListState } from "./crm-view-models";

/**
 * Listagem de contatos: tabela densa no desktop, cartões no mobile.
 *
 * Componente puro — recebe as linhas já carregadas e filtradas pelo servidor,
 * não busca dados e não decide autorização.
 *
 * As colunas de telefone, e-mail, origem e última atualização **não existem
 * aqui** porque `search_contacts` não as devolve. Preenchê-las com "—" em toda
 * linha seria ruído; o detalhe do contato traz esses dados de verdade, e o
 * rodapé diz isso em uma frase.
 */
export function ContactList({
  rows,
  state = "ready",
  hasFilters = false,
  scopeNote,
  limitNote,
  emptyAction,
  label = "Contatos da clínica",
}: {
  rows: readonly ContactRowView[];
  state?: CrmListState;
  hasFilters?: boolean;
  scopeNote?: string;
  limitNote?: string;
  emptyAction?: ReactNode;
  label?: string;
}) {
  if (state === "loading") return <LoadingTable columns={4} label="Carregando contatos…" />;

  if (state === "error") {
    return <ErrorState
      description="Não conseguimos carregar a lista agora. Tente novamente em alguns instantes."
      title="Não foi possível carregar os contatos"
    />;
  }

  if (rows.length === 0) {
    return hasFilters
      ? <EmptyState
        description="Ajuste a pesquisa, o responsável ou a situação para ver mais contatos."
        title="Nenhum contato para estes filtros"
      />
      : <EmptyState
        action={emptyAction}
        description="Cadastre a primeira pessoa da clínica para começar a acompanhar oportunidades."
        title="Nenhum contato cadastrado"
      />;
  }

  return <div className="flex min-h-0 flex-col gap-3">
    <p className="text-xs text-muted-foreground" role="status">
      {rows.length} contato(s){scopeNote ? ` · ${scopeNote}` : ""}
    </p>

    <div className="hidden min-h-0 md:flex md:flex-col">
      <DataTable label={label}>
        <caption className="sr-only">
          Contatos da clínica com responsável, situação e data de cadastro.
        </caption>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Contato</DataTableHeaderCell>
            <DataTableHeaderCell>Responsável</DataTableHeaderCell>
            <DataTableHeaderCell>Situação</DataTableHeaderCell>
            <DataTableHeaderCell>Cadastrado em</DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <tbody>
          {rows.map((row) => <tr className="border-t border-border transition-colors hover:bg-muted/60" key={row.id}>
            <DataTableHeaderCell className="max-w-[20rem] font-medium" scope="row">
              <Link
                className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                href={row.href}
              >
                {row.fullName}
              </Link>
            </DataTableHeaderCell>
            <DataTableCell className="max-w-[14rem] truncate text-muted-foreground">
              {row.ownerName ?? "Sem responsável"}
            </DataTableCell>
            <DataTableCell>
              {row.archived
                ? <StatusBadge tone="neutral">Arquivado</StatusBadge>
                : <StatusBadge tone="success">Ativo</StatusBadge>}
            </DataTableCell>
            <DataTableCell className="whitespace-nowrap text-muted-foreground">
              {row.createdAtLabel || UNKNOWN_FIELD_LABEL}
            </DataTableCell>
          </tr>)}
        </tbody>
      </DataTable>
    </div>

    <ul aria-label={label} className="grid gap-2 md:hidden">
      {rows.map((row) => <li className="rounded-lg border border-border bg-surface p-3" key={row.id}>
        <div className="flex items-start justify-between gap-2">
          <Link
            className="min-w-0 truncate font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            href={row.href}
          >
            {row.fullName}
          </Link>
          {row.archived
            ? <StatusBadge tone="neutral">Arquivado</StatusBadge>
            : <StatusBadge tone="success">Ativo</StatusBadge>}
        </div>
        <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <dt className="inline font-medium">Responsável: </dt>
            <dd className="inline">{row.ownerName ?? "sem responsável"}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Cadastrado em: </dt>
            <dd className="inline">{row.createdAtLabel || UNKNOWN_FIELD_LABEL}</dd>
          </div>
        </dl>
      </li>)}
    </ul>

    <p className="text-xs text-muted-foreground">
      Telefone, e-mail e histórico de cada pessoa aparecem no detalhe do contato.
      {limitNote ? ` ${limitNote}` : ""}
    </p>
  </div>;
}
