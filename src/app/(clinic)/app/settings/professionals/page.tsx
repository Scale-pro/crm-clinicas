import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveActiveClinicContext } from "@/modules/tenancy";
import { requirePermission } from "@/shared/auth";
import { AccessDeniedState } from "@/shared/ui/access-denied-state";
import { Button } from "@/shared/ui/button";
import { PageToolbar } from "@/shared/ui/page-toolbar";

import { ProfessionalList } from "../../_operations/professional-list";

/**
 * Profissionais da clínica.
 *
 * A fundação visual está pronta (listagem, filtros, formulário, especialidades e
 * disponibilidade semanal em `../../_operations`), mas o contrato de backend
 * correspondente ainda não existe. Por isso a página resolve tenant e permissão
 * de verdade e declara o estado real de indisponibilidade — sem dados
 * fictícios, sem persistência simulada e sem ação que aparente salvar.
 *
 * Quando as consultas existirem, esta página passa a mapear os registros para
 * `ProfessionalSummaryView` e troca o estado por `ready`; os componentes não
 * mudam.
 */
export default async function ProfessionalsSettingsPage() {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") redirect("/app");
  const manageAccess = await requirePermission(context.clinic.id, "clinic.manage");

  const toolbar = <PageToolbar
    actions={<Button asChild size="sm" variant="outline">
      <Link href="/app/settings"><ArrowLeft aria-hidden="true" />Configurações</Link>
    </Button>}
    description="Quem atende na clínica, especialidades e disponibilidade semanal."
    title="Profissionais"
  />;

  if (!manageAccess.allowed) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        <AccessDeniedState
          action={<Button asChild size="sm" variant="outline"><Link href="/app/settings">Voltar às configurações</Link></Button>}
          description="O cadastro de profissionais exige a permissão de gestão da clínica. Fale com um responsável."
        />
      </div>
    </div>;
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    {toolbar}
    <div className="scroll-slim min-h-0 flex-1 overflow-auto p-4 sm:p-5">
      <ProfessionalList rows={[]} state="unavailable" />
    </div>
  </div>;
}
