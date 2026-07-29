"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { formatBrlFromCents } from "@/shared/lib/currency";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import {
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
} from "@/shared/ui/data-table";
import { StatusBadge } from "@/shared/ui/status-badge";

import { statusLabel, statusTone, sumAmountCents, type LeadRow } from "./opportunity-view";

const checkboxClassName =
  "size-4 shrink-0 accent-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Lista densa de oportunidades. No desktop é uma tabela com cabeçalho fixo e
 * seleção de linhas; abaixo de `md` vira cartões legíveis. A navegação por
 * teclado usa os links reais de cada linha — o clique na linha é atalho extra.
 */
export function OpportunityTable({ rows, label, showPipelineColumn = false }: {
  rows: readonly LeadRow[];
  label: string;
  showPipelineColumn?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<readonly string[]>([]);
  const selectedRows = useMemo(
    () => rows.filter((row) => selected.includes(row.id)),
    [rows, selected],
  );
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;

  function toggle(id: string) {
    setSelected((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  }

  return <div className="flex min-h-0 flex-col gap-2">
    {selectedRows.length > 0 ? <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-accent/35 bg-accent/10 px-3 py-2 text-sm"
      role="status"
    >
      <span className="font-medium">{selectedRows.length} selecionada(s)</span>
      <span className="text-muted-foreground">
        Soma dos valores: <strong className="font-semibold tabular-nums text-foreground">{formatBrlFromCents(sumAmountCents(selectedRows)) ?? "—"}</strong>
      </span>
      <Button className="ms-auto" onClick={() => setSelected([])} size="sm" type="button" variant="outline">Limpar seleção</Button>
    </div> : null}

    <div className="hidden min-h-0 md:flex md:flex-col">
      <DataTable label={label}>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell className="w-9">
              <input
                aria-label="Selecionar todas as oportunidades visíveis"
                checked={allSelected}
                className={checkboxClassName}
                onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.id))}
                type="checkbox"
              />
            </DataTableHeaderCell>
            <DataTableHeaderCell>Oportunidade</DataTableHeaderCell>
            <DataTableHeaderCell>Contato</DataTableHeaderCell>
            {showPipelineColumn ? <DataTableHeaderCell>Pipeline</DataTableHeaderCell> : null}
            <DataTableHeaderCell>Responsável</DataTableHeaderCell>
            <DataTableHeaderCell>Etapa</DataTableHeaderCell>
            <DataTableHeaderCell>Estado</DataTableHeaderCell>
            <DataTableHeaderCell>Origem</DataTableHeaderCell>
            <DataTableHeaderCell className="text-right">Valor</DataTableHeaderCell>
            <DataTableHeaderCell>Atualização</DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <tbody>
          {rows.map((row) => <tr
            className={cn(
              "cursor-pointer border-t border-border transition-colors hover:bg-muted/60",
              selected.includes(row.id) && "bg-accent/5",
            )}
            key={row.id}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a,input,button")) return;
              router.push(row.href);
            }}
          >
            <DataTableCell>
              <input
                aria-label={`Selecionar ${row.title}`}
                checked={selected.includes(row.id)}
                className={checkboxClassName}
                onChange={() => toggle(row.id)}
                type="checkbox"
              />
            </DataTableCell>
            <DataTableCell className="max-w-[18rem]">
              <Link className="font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href={row.href}>
                {row.title}
              </Link>
            </DataTableCell>
            <DataTableCell className="max-w-[14rem] truncate text-muted-foreground">{row.contactName}</DataTableCell>
            {showPipelineColumn ? <DataTableCell className="text-muted-foreground">{row.pipelineName ?? "—"}</DataTableCell> : null}
            <DataTableCell className="whitespace-nowrap text-muted-foreground">{row.assigneeName}</DataTableCell>
            <DataTableCell><StatusBadge accent={row.stageAccent}>{row.stageName}</StatusBadge></DataTableCell>
            <DataTableCell><StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge></DataTableCell>
            <DataTableCell className="whitespace-nowrap text-muted-foreground">{row.sourceName ?? "—"}</DataTableCell>
            <DataTableCell className="whitespace-nowrap text-right font-medium tabular-nums">{row.amountLabel ?? "—"}</DataTableCell>
            <DataTableCell className="whitespace-nowrap text-muted-foreground">{row.updatedLabel}</DataTableCell>
          </tr>)}
        </tbody>
      </DataTable>
    </div>

    <ul aria-label={label} className="grid gap-2 md:hidden">
      {rows.map((row) => <li className="rounded-lg border border-border bg-surface p-3" key={row.id}>
        <div className="flex items-start justify-between gap-2">
          <Link className="font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href={row.href}>
            {row.title}
          </Link>
          <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{row.amountLabel ?? "—"}</span>
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{row.contactName}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge accent={row.stageAccent}>{row.stageName}</StatusBadge>
          <StatusBadge tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge>
          {row.sourceName ? <StatusBadge>{row.sourceName}</StatusBadge> : null}
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
          <div><dt className="inline font-medium">Responsável: </dt><dd className="inline">{row.assigneeName}</dd></div>
          <div><dt className="inline font-medium">Atualização: </dt><dd className="inline">{row.updatedLabel}</dd></div>
        </dl>
      </li>)}
    </ul>
  </div>;
}
