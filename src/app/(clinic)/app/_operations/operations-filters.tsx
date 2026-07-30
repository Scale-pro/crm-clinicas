import Link from "next/link";

import { Button } from "@/shared/ui/button";
import { FilterPopover } from "@/shared/ui/filter-popover";
import { formSelectClassName } from "@/shared/ui/form-field";
import { SearchField } from "@/shared/ui/search-field";

import { activeFilterCount, type StatusFilter } from "./operations-view-models";

/**
 * Barra de busca e filtros das listagens de operações. Segue o padrão do CRM:
 * `form method="get"` que apenas reescreve a query string — a filtragem final
 * é responsabilidade do servidor quando o carregamento existir.
 */
export function OperationsFilterBar({
  basePath,
  idPrefix,
  searchLabel,
  searchPlaceholder,
  search,
  status,
  facetLabel,
  facetName,
  facetValue,
  facetOptions,
}: {
  basePath: string;
  idPrefix: string;
  searchLabel: string;
  searchPlaceholder: string;
  search: string;
  status: StatusFilter;
  /** Segundo filtro da tela: especialidade (profissionais) ou categoria. */
  facetLabel: string;
  facetName: string;
  facetValue: string;
  facetOptions: readonly string[];
}) {
  const activeCount = activeFilterCount({ category: facetValue, status });

  return <form action={basePath} className="flex flex-wrap items-center gap-2" method="get">
    <SearchField
      defaultValue={search}
      id={`${idPrefix}-q`}
      label={searchLabel}
      placeholder={searchPlaceholder}
    />
    <FilterPopover
      activeCount={activeCount}
      footer={<>
        <Button asChild size="sm" variant="ghost"><Link href={basePath}>Limpar filtros</Link></Button>
        <Button size="sm" type="submit">Aplicar filtros</Button>
      </>}
    >
      <label className="grid gap-1 text-xs font-medium" htmlFor={`${idPrefix}-status`}>
        Situação
        <select className={formSelectClassName} defaultValue={status} id={`${idPrefix}-status`} name="statusFilter">
          <option value="all">Todas</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium" htmlFor={`${idPrefix}-facet`}>
        {facetLabel}
        <select className={formSelectClassName} defaultValue={facetValue} id={`${idPrefix}-facet`} name={facetName}>
          <option value="">Todas</option>
          {facetOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    </FilterPopover>
    {activeCount > 0 || search
      ? <p className="text-xs text-muted-foreground" role="status">
        {activeCount} filtro(s) além da pesquisa.{" "}
        <Link className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href={basePath}>
          Limpar tudo
        </Link>
      </p>
      : null}
  </form>;
}
