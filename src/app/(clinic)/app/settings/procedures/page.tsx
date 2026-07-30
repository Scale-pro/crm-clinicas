import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listProcedures } from "@/modules/scheduling";
import { resolveActiveClinicContext } from "@/modules/tenancy";
import { requirePermission } from "@/shared/auth";
import { AccessDeniedState } from "@/shared/ui/access-denied-state";
import { Button } from "@/shared/ui/button";
import { PageToolbar } from "@/shared/ui/page-toolbar";

import { procedureSummaryFromRow } from "../../_operations/operations-adapters";
import { OperationsFilterBar } from "../../_operations/operations-filters";
import { OperationsPagination } from "../../_operations/operations-pagination";
import {
  OPERATIONS_MAX_PAGE_SIZE,
  OPERATIONS_PAGE_SIZE,
  PROCEDURES_PATH,
  PROCEDURE_QUERY_KEYS,
  operationsHref,
  pageParam,
  statusFilterParam,
  statusFilterToQuery,
  stringParam,
  type RouteParams,
} from "../../_operations/operations-routes";
import { ProcedureList } from "../../_operations/procedure-list";
import { ProceduresScreen } from "./procedures-screen";

/**
 * Procedimentos da clínica.
 *
 * Mesmo contrato da tela de profissionais: tenant e permissões resolvidos no
 * servidor, leitura por `procedure.view` e gestão por `procedure.manage`.
 *
 * A barra de filtros oferece apenas busca e situação porque é isso que
 * `listProcedures` sabe filtrar. Um seletor de categoria que a listagem
 * ignorasse pareceria funcionar sem funcionar.
 */
export default async function ProceduresSettingsPage({ searchParams }: {
  searchParams: Promise<RouteParams>;
}) {
  const [context, params] = await Promise.all([resolveActiveClinicContext(), searchParams]);
  if (context.status !== "ready") redirect("/app");
  const clinicId = context.clinic.id;

  const [viewAccess, manageAccess] = await Promise.all([
    requirePermission(clinicId, "procedure.view"),
    requirePermission(clinicId, "procedure.manage"),
  ]);

  const toolbar = <PageToolbar
    actions={<Button asChild size="sm" variant="outline">
      <Link href="/app/settings"><ArrowLeft aria-hidden="true" />Configurações</Link>
    </Button>}
    description="O que a clínica oferece, com duração padrão e preço-base."
    title="Procedimentos"
  />;

  if (!viewAccess.allowed) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        <AccessDeniedState
          action={<Button asChild size="sm" variant="outline"><Link href="/app/settings">Voltar às configurações</Link></Button>}
          description="A lista de procedimentos exige permissão de visualização. Fale com um responsável da clínica."
        />
      </div>
    </div>;
  }

  const search = stringParam(params.q);
  const status = statusFilterParam(params.statusFilter);
  const page = pageParam(params.page);

  const [result, facets] = await Promise.all([
    listProcedures({
      clinicId,
      page,
      pageSize: OPERATIONS_PAGE_SIZE,
      search,
      status: statusFilterToQuery(status),
    }),
    // Categorias já usadas na clínica, oferecidas como sugestão no formulário.
    listProcedures({ clinicId, page: 1, pageSize: OPERATIONS_MAX_PAGE_SIZE }),
  ]);

  const filters = <OperationsFilterBar
    basePath={PROCEDURES_PATH}
    idPrefix="procedures"
    search={search}
    searchLabel="Buscar procedimento"
    searchPlaceholder="Nome do procedimento"
    status={status}
  />;

  if (!result.ok) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="scroll-slim min-h-0 flex-1 space-y-3 overflow-auto p-4 sm:p-5">
        {filters}
        <ProcedureList rows={[]} state="error" />
      </div>
    </div>;
  }

  const categories = facets.ok
    ? [...new Set(facets.items
      .map((item) => item.category)
      .filter((category): category is string => category !== null))]
      .sort((left, right) => left.localeCompare(right, "pt-BR"))
    : [];

  const rows = result.items.map(procedureSummaryFromRow);
  const hasFilters = search !== "" || status !== "all";
  const href = (targetPage: number) => operationsHref(
    PROCEDURES_PATH,
    PROCEDURE_QUERY_KEYS,
    params,
    { page: targetPage > 1 ? String(targetPage) : "" },
  );

  return <div className="flex min-h-0 flex-1 flex-col">
    {toolbar}
    <div className="scroll-slim min-h-0 flex-1 space-y-3 overflow-auto p-4 sm:p-5">
      {filters}
      <ProceduresScreen
        canManage={manageAccess.allowed}
        categories={categories}
        hasFilters={hasFilters}
        rows={rows}
        totalCount={result.total}
      />
      <OperationsPagination
        label="Paginação dos procedimentos"
        nextHref={href(page + 1)}
        page={page}
        pageSize={OPERATIONS_PAGE_SIZE}
        previousHref={href(page - 1)}
        total={result.total}
      />
    </div>
  </div>;
}
