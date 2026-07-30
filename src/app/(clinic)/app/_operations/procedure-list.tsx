import type { ReactNode } from "react";
import Link from "next/link";

import { formatBrlFromCents } from "@/shared/lib/currency";
import { formatMinutesAsDuration } from "@/shared/lib/duration";
import { ColorIndicator } from "@/shared/ui/color-indicator";
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

import { IntegrationPendingState } from "./operations-states";
import {
  agendaColor,
  optionalCount,
  statusLabel,
  statusTone,
  type OperationsListState,
  type ProcedureSummaryView,
} from "./operations-view-models";

/**
 * Listagem de procedimentos: tabela densa no desktop, cartões no mobile.
 *
 * Componente puro — não busca dados nem decide autorização. Esta entrega não
 * exibe faturamento, custo, margem ou comissão: apenas duração, preço-base e
 * quantos profissionais estão habilitados.
 */
export function ProcedureList({
  rows,
  state = "ready",
  totalCount,
  hasFilters = false,
  canCreate = false,
  createSlot,
  rowActions,
  emptyAction,
  label = "Procedimentos da clínica",
}: {
  rows: readonly ProcedureSummaryView[];
  state?: OperationsListState;
  totalCount?: number;
  hasFilters?: boolean;
  /** Permissão já verificada no servidor. `PermissionGate` aqui é só UX. */
  canCreate?: boolean;
  createSlot?: ReactNode;
  rowActions?: (row: ProcedureSummaryView) => ReactNode;
  emptyAction?: ReactNode;
  label?: string;
}) {
  if (state === "loading") return <LoadingTable columns={6} label="Carregando procedimentos…" />;

  if (state === "error") {
    return <ErrorState
      description="Não conseguimos carregar a lista agora. Tente novamente em alguns instantes."
      title="Não foi possível carregar os procedimentos"
    />;
  }

  if (state === "unavailable") return <IntegrationPendingState subject="os procedimentos" />;

  if (rows.length === 0) {
    return hasFilters
      ? <EmptyState
        description="Ajuste a pesquisa, a situação ou a categoria para ver mais procedimentos."
        title="Nenhum procedimento para estes filtros"
      />
      : <EmptyState
        action={canCreate ? emptyAction : undefined}
        description="Cadastre o que a clínica oferece para montar agenda, duração e preço-base."
        title="Nenhum procedimento cadastrado"
      />;
  }

  // `listProcedures` não conta vínculos: o número real de profissionais
  // habilitados aparece no detalhe do procedimento, e aqui fica "—".
  const hasUnknownColumns = rows.some((row) => row.enabledProfessionalCount === undefined);

  return <div className="flex min-h-0 flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground" role="status">
        {rows.length} de {totalCount ?? rows.length} procedimento(s)
      </p>
      {canCreate ? createSlot : null}
    </div>
    {hasUnknownColumns
      ? <p className="text-xs text-muted-foreground">
        Os campos marcados com “—” aparecem no detalhe de cada procedimento.
      </p>
      : null}

    <div className="hidden min-h-0 md:flex md:flex-col">
      <DataTable label={label}>
        <caption className="sr-only">
          Procedimentos da clínica com categoria, duração padrão, preço-base, cor, situação e
          quantidade de profissionais habilitados.
        </caption>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Procedimento</DataTableHeaderCell>
            <DataTableHeaderCell>Categoria</DataTableHeaderCell>
            <DataTableHeaderCell className="text-right">Duração</DataTableHeaderCell>
            <DataTableHeaderCell className="text-right">Preço-base</DataTableHeaderCell>
            <DataTableHeaderCell>Cor</DataTableHeaderCell>
            <DataTableHeaderCell className="text-right">Profissionais</DataTableHeaderCell>
            <DataTableHeaderCell>Situação</DataTableHeaderCell>
            {rowActions ? <DataTableHeaderCell className="text-right">Ações</DataTableHeaderCell> : null}
          </tr>
        </DataTableHead>
        <tbody>
          {rows.map((row) => {
            const color = agendaColor(row.colorToken);
            return <tr className="border-t border-border transition-colors hover:bg-muted/60" key={row.id}>
              <DataTableHeaderCell className="max-w-[18rem] font-medium" scope="row">
                <Link
                  className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  href={row.href}
                >
                  {row.name}
                </Link>
              </DataTableHeaderCell>
              <DataTableCell className="max-w-[12rem] truncate text-muted-foreground">{row.category ?? "Sem categoria"}</DataTableCell>
              <DataTableCell className="whitespace-nowrap text-right tabular-nums">{formatMinutesAsDuration(row.durationMinutes)}</DataTableCell>
              <DataTableCell className="whitespace-nowrap text-right font-medium tabular-nums">{formatBrlFromCents(row.basePriceCents)}</DataTableCell>
              <DataTableCell><ColorIndicator color={color.cssValue} label={color.label} /></DataTableCell>
              <DataTableCell className="text-right tabular-nums">{optionalCount(row.enabledProfessionalCount)}</DataTableCell>
              <DataTableCell><StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge></DataTableCell>
              {rowActions ? <DataTableCell className="text-right">{rowActions(row)}</DataTableCell> : null}
            </tr>;
          })}
        </tbody>
      </DataTable>
    </div>

    <ul aria-label={label} className="grid gap-2 md:hidden">
      {rows.map((row) => {
        const color = agendaColor(row.colorToken);
        return <li className="rounded-lg border border-border bg-surface p-3" key={row.id}>
          <div className="flex items-start justify-between gap-2">
            <Link
              className="min-w-0 truncate font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              href={row.href}
            >
              {row.name}
            </Link>
            <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{formatBrlFromCents(row.basePriceCents)}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge>
            {row.category ? <StatusBadge>{row.category}</StatusBadge> : null}
          </div>
          <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <div><dt className="inline font-medium">Duração: </dt><dd className="inline tabular-nums">{formatMinutesAsDuration(row.durationMinutes)}</dd></div>
            <div><dt className="inline font-medium">Cor: </dt><dd className="inline">{color.label}</dd></div>
            <div><dt className="inline font-medium">Profissionais habilitados: </dt><dd className="inline tabular-nums">{optionalCount(row.enabledProfessionalCount)}</dd></div>
          </dl>
          {rowActions ? <div className="mt-2 flex flex-wrap justify-end gap-2">{rowActions(row)}</div> : null}
        </li>;
      })}
    </ul>
  </div>;
}
