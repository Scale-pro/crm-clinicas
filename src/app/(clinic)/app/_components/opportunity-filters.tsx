import Link from "next/link";

import { Button } from "@/shared/ui/button";
import { FilterPopover } from "@/shared/ui/filter-popover";
import { SearchField } from "@/shared/ui/search-field";

type Option = { readonly id: string; readonly label: string };

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Filtros de oportunidades compartilhados pelo Kanban e por "Todos os leads".
 * Tudo continua sendo resolvido no servidor: o formulário é `GET` e apenas
 * reescreve a query string consumida pelo caso de uso do domínio.
 */
export function OpportunityFilters({
  basePath,
  idPrefix,
  search,
  assignedToUserId,
  initialSourceId,
  status,
  defaultStatus,
  owners,
  sources,
  pageSize,
}: {
  basePath: string;
  idPrefix: string;
  search: string;
  assignedToUserId: string;
  initialSourceId: string;
  status: string;
  defaultStatus: string;
  owners: readonly Option[];
  sources: readonly Option[];
  pageSize: number;
}) {
  const activeCount = [
    assignedToUserId,
    initialSourceId,
    status === defaultStatus ? "" : status,
  ].filter(Boolean).length;

  return <form action={basePath} className="flex flex-wrap items-center gap-2" method="get">
    <SearchField
      defaultValue={search}
      id={`${idPrefix}-q`}
      label="Pesquisar oportunidades"
      placeholder="Contato ou título"
    />
    <FilterPopover
      activeCount={activeCount}
      footer={<>
        <Button asChild size="sm" variant="ghost"><Link href={basePath}>Limpar filtros</Link></Button>
        <Button size="sm" type="submit">Aplicar filtros</Button>
      </>}
    >
      <label className="grid gap-1 text-xs font-medium" htmlFor={`${idPrefix}-assignee`}>
        Responsável
        <select className={selectClassName} defaultValue={assignedToUserId} id={`${idPrefix}-assignee`} name="assignee">
          <option value="">Todos permitidos</option>
          {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium" htmlFor={`${idPrefix}-source`}>
        Origem
        <select className={selectClassName} defaultValue={initialSourceId} id={`${idPrefix}-source`} name="source">
          <option value="">Todas</option>
          {sources.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium" htmlFor={`${idPrefix}-status`}>
        Estado
        <select className={selectClassName} defaultValue={status} id={`${idPrefix}-status`} name="statusFilter">
          <option value="open">Abertas</option>
          <option value="won">Ganhas</option>
          <option value="lost">Perdidas</option>
          <option value="all">Todas</option>
        </select>
      </label>
    </FilterPopover>
    <input name="pageSize" type="hidden" value={pageSize} />
    {activeCount > 0 || search
      ? <p className="text-xs text-muted-foreground" role="status">
        {activeCount} filtro(s) além da pesquisa. <Link className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href={basePath}>Limpar tudo</Link>
      </p>
      : null}
  </form>;
}
