import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listProfessionals } from "@/modules/scheduling";
import { listActiveClinicMembers, resolveActiveClinicContext } from "@/modules/tenancy";
import { requirePermission } from "@/shared/auth";
import { AccessDeniedState } from "@/shared/ui/access-denied-state";
import { Button } from "@/shared/ui/button";
import { PageToolbar } from "@/shared/ui/page-toolbar";

import { professionalSummaryFromRow } from "../../_operations/operations-adapters";
import { OperationsFilterBar } from "../../_operations/operations-filters";
import { OperationsPagination } from "../../_operations/operations-pagination";
import {
  OPERATIONS_MAX_PAGE_SIZE,
  OPERATIONS_PAGE_SIZE,
  PROFESSIONALS_PATH,
  PROFESSIONAL_QUERY_KEYS,
  operationsHref,
  pageParam,
  statusFilterParam,
  statusFilterToQuery,
  stringParam,
  type RouteParams,
} from "../../_operations/operations-routes";
import { ProfessionalList } from "../../_operations/professional-list";
import { ProfessionalsScreen } from "./professionals-screen";

/**
 * Profissionais da clínica.
 *
 * Tenant, permissão e dados são resolvidos no servidor: `clinic_id` vem do
 * contexto ativo (nunca da URL), a leitura exige `professional.view` e a gestão
 * exige `professional.manage`. Busca, situação e especialidade são aplicadas
 * pelo próprio contrato de listagem — a filtragem não acontece no navegador.
 */
export default async function ProfessionalsSettingsPage({ searchParams }: {
  searchParams: Promise<RouteParams>;
}) {
  const [context, params] = await Promise.all([resolveActiveClinicContext(), searchParams]);
  if (context.status !== "ready") redirect("/app");
  const clinicId = context.clinic.id;

  const [viewAccess, manageAccess] = await Promise.all([
    requirePermission(clinicId, "professional.view"),
    requirePermission(clinicId, "professional.manage"),
  ]);

  const toolbar = <PageToolbar
    actions={<Button asChild size="sm" variant="outline">
      <Link href="/app/settings"><ArrowLeft aria-hidden="true" />Configurações</Link>
    </Button>}
    description="Quem atende na clínica, especialidades e disponibilidade semanal."
    title="Profissionais"
  />;

  if (!viewAccess.allowed) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        <AccessDeniedState
          action={<Button asChild size="sm" variant="outline"><Link href="/app/settings">Voltar às configurações</Link></Button>}
          description="A lista de profissionais exige permissão de visualização. Fale com um responsável da clínica."
        />
      </div>
    </div>;
  }

  const search = stringParam(params.q);
  const status = statusFilterParam(params.statusFilter);
  const specialty = stringParam(params.specialty);
  const page = pageParam(params.page);

  const [result, facets, members] = await Promise.all([
    listProfessionals({
      clinicId,
      page,
      pageSize: OPERATIONS_PAGE_SIZE,
      search,
      specialty: specialty || null,
      status: statusFilterToQuery(status),
    }),
    // Opções do filtro de especialidade: uma leitura ampla e sem filtros, para
    // que a opção escolhida não desapareça ao mudar de página.
    listProfessionals({ clinicId, page: 1, pageSize: OPERATIONS_MAX_PAGE_SIZE }),
    manageAccess.allowed
      ? listActiveClinicMembers({ clinicId, pageSize: OPERATIONS_MAX_PAGE_SIZE })
      : Promise.resolve({ ok: false as const, code: "forbidden" as const }),
  ]);

  const specialtyOptions = facets.ok
    ? [...new Set(facets.items.flatMap((item) => item.specialties))].sort(
      (left, right) => left.localeCompare(right, "pt-BR"),
    )
    : [];
  // A especialidade em uso continua selecionável mesmo se estiver fora do topo
  // da lista — nunca perdemos o filtro que a pessoa já aplicou.
  const facetOptions = specialty && !specialtyOptions.includes(specialty)
    ? [specialty, ...specialtyOptions]
    : specialtyOptions;

  const filters = <OperationsFilterBar
    basePath={PROFESSIONALS_PATH}
    facetLabel="Especialidade"
    facetName="specialty"
    facetOptions={facetOptions}
    facetValue={specialty}
    idPrefix="professionals"
    search={search}
    searchLabel="Buscar profissional"
    searchPlaceholder="Nome ou especialidade"
    status={status}
  />;

  if (!result.ok) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="scroll-slim min-h-0 flex-1 space-y-3 overflow-auto p-4 sm:p-5">
        {filters}
        <ProfessionalList rows={[]} state="error" />
      </div>
    </div>;
  }

  const rows = result.items.map(professionalSummaryFromRow);
  const hasFilters = search !== "" || status !== "all" || specialty !== "";
  const href = (targetPage: number) => operationsHref(
    PROFESSIONALS_PATH,
    PROFESSIONAL_QUERY_KEYS,
    params,
    { page: targetPage > 1 ? String(targetPage) : "" },
  );

  return <div className="flex min-h-0 flex-1 flex-col">
    {toolbar}
    <div className="scroll-slim min-h-0 flex-1 space-y-3 overflow-auto p-4 sm:p-5">
      {filters}
      <ProfessionalsScreen
        canManage={manageAccess.allowed}
        hasFilters={hasFilters}
        rows={rows}
        teamMembers={members.ok
          ? members.items.map((member) => ({ id: member.userId, name: member.fullName }))
          : []}
        timezoneLabel={context.clinic.timezone}
        totalCount={result.total}
      />
      <OperationsPagination
        label="Paginação dos profissionais"
        nextHref={href(page + 1)}
        page={page}
        pageSize={OPERATIONS_PAGE_SIZE}
        previousHref={href(page - 1)}
        total={result.total}
      />
    </div>
  </div>;
}
