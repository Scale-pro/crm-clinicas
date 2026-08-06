import type { ReactNode } from "react";
import Link from "next/link";

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
  optionalText,
  statusLabel,
  statusTone,
  type OperationsListState,
  type ProfessionalSummaryView,
} from "./operations-view-models";

/** Lista compacta de especialidades com transbordo contado, nunca truncado em silêncio. */
function SpecialtyList({ specialties, limit = 3 }: {
  specialties: readonly string[];
  limit?: number;
}) {
  if (specialties.length === 0) {
    return <span className="text-sm text-muted-foreground">Sem especialidade</span>;
  }
  const visible = specialties.slice(0, limit);
  const hidden = specialties.length - visible.length;
  return <span className="flex flex-wrap items-center gap-1">
    {visible.map((specialty) => <StatusBadge key={specialty}>{specialty}</StatusBadge>)}
    {hidden > 0 ? <span className="text-xs text-muted-foreground">+{hidden}</span> : null}
  </span>;
}

/**
 * Listagem de profissionais: tabela densa no desktop, cartões no mobile.
 *
 * Componente puro — recebe as linhas já filtradas, a permissão já resolvida no
 * servidor e as ações como slots. Não busca dados, não decide autorização e não
 * exibe identificadores técnicos.
 */
export function ProfessionalList({
  rows,
  state = "ready",
  totalCount,
  hasFilters = false,
  canCreate = false,
  createSlot,
  rowActions,
  emptyAction,
  label = "Profissionais da clínica",
}: {
  rows: readonly ProfessionalSummaryView[];
  state?: OperationsListState;
  /** Total antes dos filtros — separa "nenhum resultado" de "nada cadastrado". */
  totalCount?: number;
  hasFilters?: boolean;
  /** Permissão já verificada no servidor. `PermissionGate` aqui é só UX. */
  canCreate?: boolean;
  createSlot?: ReactNode;
  rowActions?: (row: ProfessionalSummaryView) => ReactNode;
  emptyAction?: ReactNode;
  label?: string;
}) {
  if (state === "loading") return <LoadingTable columns={6} label="Carregando profissionais…" />;

  if (state === "error") {
    return <ErrorState
      description="Não conseguimos carregar a lista agora. Tente novamente em alguns instantes."
      title="Não foi possível carregar os profissionais"
    />;
  }

  if (state === "unavailable") return <IntegrationPendingState subject="os profissionais" />;

  if (rows.length === 0) {
    return hasFilters
      ? <EmptyState
        description="Ajuste a pesquisa, a situação ou a especialidade para ver mais profissionais."
        title="Nenhum profissional para estes filtros"
      />
      : <EmptyState
        action={canCreate ? emptyAction : undefined}
        description="Cadastre quem atende na clínica para montar a agenda e habilitar procedimentos."
        title="Nenhum profissional cadastrado"
      />;
  }

  // A listagem do backend traz identificação, especialidades, cor e situação.
  // Usuário vinculado, horários e procedimentos habilitados vivem no detalhe;
  // aqui aparecem como "—" em vez de um valor que não foi consultado.
  const hasUnknownColumns = rows.some((row) => row.linkedUserName === undefined
    || row.weekdaysLabel === undefined
    || row.enabledProcedureCount === undefined);

  return <div className="flex min-h-0 flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground" role="status">
        {rows.length} de {totalCount ?? rows.length} profissional(is)
      </p>
      {canCreate ? createSlot : null}
    </div>
    {hasUnknownColumns
      ? <p className="text-xs text-muted-foreground">
        Os campos marcados com “—” aparecem no detalhe de cada profissional.
      </p>
      : null}

    <div className="hidden min-h-0 md:flex md:flex-col">
      <DataTable label={label}>
        <caption className="sr-only">
          Profissionais da clínica com especialidades, cor da agenda, situação, horários e
          procedimentos habilitados.
        </caption>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Profissional</DataTableHeaderCell>
            <DataTableHeaderCell>Especialidades</DataTableHeaderCell>
            <DataTableHeaderCell>Usuário vinculado</DataTableHeaderCell>
            <DataTableHeaderCell>Cor da agenda</DataTableHeaderCell>
            <DataTableHeaderCell>Situação</DataTableHeaderCell>
            <DataTableHeaderCell>Horários</DataTableHeaderCell>
            <DataTableHeaderCell className="text-right">Procedimentos</DataTableHeaderCell>
            {rowActions ? <DataTableHeaderCell className="text-right">Ações</DataTableHeaderCell> : null}
          </tr>
        </DataTableHead>
        <tbody>
          {rows.map((row) => {
            const color = agendaColor(row.colorToken);
            return <tr className="border-t border-border transition-colors hover:bg-muted/60" key={row.id}>
              <DataTableHeaderCell className="max-w-[16rem] font-medium" scope="row">
                <Link
                  className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  href={row.href}
                >
                  {row.displayName}
                </Link>
              </DataTableHeaderCell>
              <DataTableCell className="max-w-[18rem]"><SpecialtyList specialties={row.specialties} /></DataTableCell>
              <DataTableCell className="max-w-[12rem] truncate text-muted-foreground">
                {optionalText(row.linkedUserName, "Sem conta vinculada")}
              </DataTableCell>
              <DataTableCell><ColorIndicator color={color.cssValue} label={color.label} /></DataTableCell>
              <DataTableCell><StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge></DataTableCell>
              <DataTableCell className="whitespace-nowrap text-muted-foreground">{optionalText(row.weekdaysLabel, "Sem horários")}</DataTableCell>
              <DataTableCell className="text-right tabular-nums">{optionalCount(row.enabledProcedureCount)}</DataTableCell>
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
              {row.displayName}
            </Link>
            <StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge>
          </div>
          <div className="mt-2"><SpecialtyList specialties={row.specialties} /></div>
          <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <div><dt className="inline font-medium">Usuário: </dt><dd className="inline">{optionalText(row.linkedUserName, "sem conta vinculada")}</dd></div>
            <div><dt className="inline font-medium">Cor da agenda: </dt><dd className="inline">{color.label}</dd></div>
            <div><dt className="inline font-medium">Horários: </dt><dd className="inline">{optionalText(row.weekdaysLabel, "Sem horários")}</dd></div>
            <div><dt className="inline font-medium">Procedimentos: </dt><dd className="inline tabular-nums">{optionalCount(row.enabledProcedureCount)}</dd></div>
          </dl>
          {rowActions ? <div className="mt-2 flex flex-wrap justify-end gap-2">{rowActions(row)}</div> : null}
        </li>;
      })}
    </ul>
  </div>;
}
