import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getProcedure,
  listActiveProfessionals,
  listProcedures,
  listProfessionalProcedures,
} from "@/modules/scheduling";
import { resolveActiveClinicContext } from "@/modules/tenancy";
import { requirePermission } from "@/shared/auth";
import { AccessDeniedState } from "@/shared/ui/access-denied-state";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";
import { PageToolbar } from "@/shared/ui/page-toolbar";

import { agendaColorFromHex } from "../../../_operations/agenda-color";
import { operationsStatus } from "../../../_operations/operations-adapters";
import {
  OPERATIONS_MAX_PAGE_SIZE,
  PROCEDURES_PATH,
} from "../../../_operations/operations-routes";
import type { ProcedureFormValues } from "../../../_operations/operations-validation";
import type { ProcedureProfessionalLinkView } from "../../../_operations/operations-view-models";
import {
  ProcedureDetailScreen,
  type ProcedureLinkState,
} from "./procedure-detail-screen";

/**
 * Detalhe de um procedimento.
 *
 * O editor de habilitações lista apenas profissionais **ativos**, porque é o
 * que o contrato de `setProfessionalProcedure` aceita — oferecer um profissional
 * inativo seria oferecer uma ação que falharia no servidor.
 */
export default async function ProcedureDetailPage({ params }: {
  params: Promise<{ procedureId: string }>;
}) {
  const [context, route] = await Promise.all([resolveActiveClinicContext(), params]);
  if (context.status !== "ready") redirect("/app");
  const clinicId = context.clinic.id;
  const procedureId = route.procedureId;

  const [viewAccess, manageAccess] = await Promise.all([
    requirePermission(clinicId, "procedure.view"),
    requirePermission(clinicId, "procedure.manage"),
  ]);

  const toolbar = <PageToolbar
    actions={<Button asChild size="sm" variant="outline">
      <Link href={PROCEDURES_PATH}><ArrowLeft aria-hidden="true" />Procedimentos</Link>
    </Button>}
    description="Duração padrão, preço-base e profissionais habilitados."
    title="Procedimento"
  />;

  if (!viewAccess.allowed) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        <AccessDeniedState
          action={<Button asChild size="sm" variant="outline"><Link href="/app/settings">Voltar às configurações</Link></Button>}
          description="Ver procedimentos exige permissão de visualização. Fale com um responsável da clínica."
        />
      </div>
    </div>;
  }

  const record = await getProcedure({ clinicId, procedureId });
  if (!record.ok) {
    if (record.code === "procedure_not_found" || record.code === "invalid_input") notFound();
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        <ErrorState
          description="Tente novamente em alguns instantes."
          title="Não foi possível carregar o procedimento"
        />
      </div>
    </div>;
  }
  const procedure = record.procedure;

  const [linkResult, professionalResult, categoryResult] = await Promise.all([
    listProfessionalProcedures({ clinicId, pageSize: OPERATIONS_MAX_PAGE_SIZE, procedureId }),
    listActiveProfessionals({ clinicId, page: 1, pageSize: OPERATIONS_MAX_PAGE_SIZE }),
    listProcedures({ clinicId, page: 1, pageSize: OPERATIONS_MAX_PAGE_SIZE }),
  ]);

  const linkedByProfessional = new Map(
    (linkResult.ok ? linkResult.items : []).map((item) => [item.professionalId, item]),
  );

  const professionals = professionalResult.ok ? professionalResult.items : [];
  const links: readonly ProcedureProfessionalLinkView[] = professionals.map((professional) => {
    const link = linkedByProfessional.get(professional.id);
    return {
      colorToken: agendaColorFromHex(professional.color),
      displayName: professional.displayName,
      durationOverrideMinutes: link?.hasDurationOverride ? link.effectiveDurationMinutes : null,
      enabled: link !== undefined,
      priceOverrideCents: link?.hasPriceOverride ? link.effectivePriceCents : null,
      professionalId: professional.id,
      specialties: professional.specialties,
    };
  });
  const linkStates: readonly ProcedureLinkState[] = professionals.map((professional) => {
    const link = linkedByProfessional.get(professional.id);
    return {
      professionalId: professional.id,
      professionalProcedureId: link?.id ?? null,
      version: link?.version ?? null,
    };
  });

  const categories = categoryResult.ok
    ? [...new Set(categoryResult.items
      .map((item) => item.category)
      .filter((category): category is string => category !== null))]
      .sort((left, right) => left.localeCompare(right, "pt-BR"))
    : [];

  const colorToken = agendaColorFromHex(procedure.color);
  const status = operationsStatus(procedure.status);
  const formValues: ProcedureFormValues = {
    basePriceCents: procedure.basePriceCents,
    category: procedure.category ?? "",
    colorToken,
    description: procedure.description ?? "",
    durationMinutes: procedure.defaultDurationMinutes,
    name: procedure.name,
    status,
  };

  return <div className="flex min-h-0 flex-1 flex-col">
    {toolbar}
    <div className="scroll-slim min-h-0 flex-1 overflow-auto p-4 sm:p-5">
      <ProcedureDetailScreen
        archived={procedure.archivedAt !== null}
        canManage={manageAccess.allowed}
        categories={categories}
        expectedVersion={procedure.version}
        formValues={formValues}
        linkStates={linkStates}
        links={links}
        procedure={{
          basePriceCents: procedure.basePriceCents,
          category: procedure.category,
          colorToken,
          description: procedure.description,
          durationMinutes: procedure.defaultDurationMinutes,
          enabledProfessionalCount: links.filter((link) => link.enabled).length,
          href: `${PROCEDURES_PATH}/${procedure.id}`,
          id: procedure.id,
          name: procedure.name,
          status,
        }}
      />
    </div>
  </div>;
}
