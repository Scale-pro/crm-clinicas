import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveActiveClinicContext } from "@/modules/tenancy";
import { requirePermission } from "@/shared/auth";
import { AccessDeniedState } from "@/shared/ui/access-denied-state";
import { Button } from "@/shared/ui/button";
import { PageToolbar } from "@/shared/ui/page-toolbar";

import { ProcedureList } from "../../_operations/procedure-list";

/**
 * Procedimentos da clínica.
 *
 * Mesmo contrato da tela de profissionais: tenant e permissão são resolvidos de
 * verdade, mas o carregamento e a gravação só existem quando o backend
 * correspondente for entregue. Até lá a página declara o estado real de
 * indisponibilidade em vez de exibir dados fictícios.
 */
export default async function ProceduresSettingsPage() {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") redirect("/app");
  const manageAccess = await requirePermission(context.clinic.id, "clinic.manage");

  const toolbar = <PageToolbar
    actions={<Button asChild size="sm" variant="outline">
      <Link href="/app/settings"><ArrowLeft aria-hidden="true" />Configurações</Link>
    </Button>}
    description="O que a clínica oferece, com duração padrão e preço-base."
    title="Procedimentos"
  />;

  if (!manageAccess.allowed) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        <AccessDeniedState
          action={<Button asChild size="sm" variant="outline"><Link href="/app/settings">Voltar às configurações</Link></Button>}
          description="O cadastro de procedimentos exige a permissão de gestão da clínica. Fale com um responsável."
        />
      </div>
    </div>;
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    {toolbar}
    <div className="scroll-slim min-h-0 flex-1 overflow-auto p-4 sm:p-5">
      <ProcedureList rows={[]} state="unavailable" />
    </div>
  </div>;
}
