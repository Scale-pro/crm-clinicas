import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getProfessional,
  getProfessionalWeeklyAvailability,
  listProfessionalProcedures,
} from "@/modules/scheduling";
import { listActiveClinicMembers, resolveActiveClinicContext } from "@/modules/tenancy";
import { requirePermission } from "@/shared/auth";
import { formatBrPhoneDigits } from "@/shared/lib/phone";
import { AccessDeniedState } from "@/shared/ui/access-denied-state";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";
import { PageToolbar } from "@/shared/ui/page-toolbar";

import { agendaColorFromHex } from "../../../_operations/agenda-color";
import {
  availabilityDraftFromIntervals,
  availabilityLabels,
  nationalPhoneDigits,
  operationsStatus,
} from "../../../_operations/operations-adapters";
import {
  OPERATIONS_MAX_PAGE_SIZE,
  PROFESSIONALS_PATH,
} from "../../../_operations/operations-routes";
import type { ProfessionalFormValues } from "../../../_operations/operations-validation";
import type { ProfessionalProcedureView } from "../../../_operations/operations-view-models";
import { ProfessionalDetailScreen } from "./professional-detail-screen";

/**
 * Detalhe de um profissional.
 *
 * O identificador vem da rota, mas nunca é usado sozinho: toda leitura passa
 * pelo contrato de `@/modules/scheduling`, que exige `professional.view` e
 * escopa a consulta pela clínica ativa resolvida no servidor. Um identificador
 * de outra clínica resulta em "não encontrado", não em dados alheios.
 */
export default async function ProfessionalDetailPage({ params }: {
  params: Promise<{ professionalId: string }>;
}) {
  const [context, route] = await Promise.all([resolveActiveClinicContext(), params]);
  if (context.status !== "ready") redirect("/app");
  const clinicId = context.clinic.id;
  const professionalId = route.professionalId;

  const [viewAccess, manageAccess] = await Promise.all([
    requirePermission(clinicId, "professional.view"),
    requirePermission(clinicId, "professional.manage"),
  ]);

  const toolbar = <PageToolbar
    actions={<Button asChild size="sm" variant="outline">
      <Link href={PROFESSIONALS_PATH}><ArrowLeft aria-hidden="true" />Profissionais</Link>
    </Button>}
    description="Cadastro, especialidades, disponibilidade semanal e procedimentos habilitados."
    title="Profissional"
  />;

  if (!viewAccess.allowed) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        <AccessDeniedState
          action={<Button asChild size="sm" variant="outline"><Link href="/app/settings">Voltar às configurações</Link></Button>}
          description="Ver profissionais exige permissão de visualização. Fale com um responsável da clínica."
        />
      </div>
    </div>;
  }

  const record = await getProfessional({ clinicId, professionalId });
  if (!record.ok) {
    if (record.code === "professional_not_found" || record.code === "invalid_input") notFound();
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        <ErrorState
          description="Tente novamente em alguns instantes."
          title="Não foi possível carregar o profissional"
        />
      </div>
    </div>;
  }
  const professional = record.professional;

  const [availabilityResult, links, members] = await Promise.all([
    getProfessionalWeeklyAvailability({ clinicId, professionalId }),
    listProfessionalProcedures({ clinicId, pageSize: OPERATIONS_MAX_PAGE_SIZE, professionalId }),
    manageAccess.allowed
      ? listActiveClinicMembers({ clinicId, pageSize: OPERATIONS_MAX_PAGE_SIZE })
      : Promise.resolve({ ok: false as const, code: "forbidden" as const }),
  ]);

  const availability = availabilityResult.ok
    ? availabilityDraftFromIntervals(availabilityResult.intervals)
    : availabilityDraftFromIntervals([]);
  const labels = availabilityLabels(availability);
  const timezoneLabel = availabilityResult.ok ? availabilityResult.timezone : context.clinic.timezone;

  const procedures: readonly ProfessionalProcedureView[] = links.ok
    ? links.items.map((item) => ({
      // `search_professional_procedures` não devolve a categoria do
      // procedimento; ela aparece na tela do procedimento, e aqui fica ausente
      // em vez de ser adivinhada.
      baseDurationMinutes: item.defaultDurationMinutes,
      basePriceCents: item.basePriceCents,
      category: null,
      durationOverrideMinutes: item.hasDurationOverride ? item.effectiveDurationMinutes : null,
      name: item.procedureName,
      priceOverrideCents: item.hasPriceOverride ? item.effectivePriceCents : null,
      procedureId: item.procedureId,
    }))
    : [];

  const teamMembers = members.ok
    ? members.items.map((member) => ({ id: member.userId, name: member.fullName }))
    : [];
  const linkedUserName = professional.userId === null
    ? null
    : teamMembers.find((member) => member.id === professional.userId)?.name ?? "Usuário da equipe";

  const colorToken = agendaColorFromHex(professional.color);
  const phone = nationalPhoneDigits(professional.phone);
  const status = operationsStatus(professional.status);

  const formValues: ProfessionalFormValues = {
    availability,
    colorToken,
    displayName: professional.displayName,
    email: professional.email ?? "",
    linkedUserId: professional.userId,
    notes: professional.notes ?? "",
    phone,
    registrationNumber: professional.professionalRegistrationNumber ?? "",
    registrationType: professional.professionalRegistrationType ?? "",
    specialties: professional.specialties,
    status,
  };

  return <div className="flex min-h-0 flex-1 flex-col">
    {toolbar}
    <div className="scroll-slim min-h-0 flex-1 overflow-auto p-4 sm:p-5">
      <ProfessionalDetailScreen
        archived={professional.archivedAt !== null}
        canManage={manageAccess.allowed}
        expectedVersion={professional.version}
        formValues={formValues}
        procedures={procedures}
        professional={{
          availability,
          availabilityLabel: labels.availabilityLabel,
          colorToken,
          displayName: professional.displayName,
          email: professional.email,
          enabledProcedureCount: procedures.length,
          href: `${PROFESSIONALS_PATH}/${professional.id}`,
          id: professional.id,
          linkedUserName,
          notes: professional.notes,
          phoneLabel: phone === "" ? null : formatBrPhoneDigits(phone),
          registrationNumber: professional.professionalRegistrationNumber,
          registrationType: professional.professionalRegistrationType,
          specialties: professional.specialties,
          status,
          weekdaysLabel: labels.weekdaysLabel,
        }}
        teamMembers={teamMembers}
        timezoneLabel={timezoneLabel}
      />
    </div>
  </div>;
}
