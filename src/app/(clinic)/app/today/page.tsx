import { redirect } from "next/navigation";

import { resolveActiveClinicContext } from "@/modules/tenancy";
import { AccessDeniedState } from "@/shared/ui/access-denied-state";
import { ErrorState } from "@/shared/ui/error-state";
import { PageToolbar } from "@/shared/ui/page-toolbar";

import { loadAgendaWorkspace } from "../_agenda/agenda-data";
import { TodayScreen } from "../_agenda/today-screen";

/**
 * Tela "Hoje": o dia corrente da clínica, no fuso da clínica.
 *
 * O dia não vem da URL nem do relógio do navegador — vem do contexto ativo
 * resolvido no servidor. Duas pessoas em fusos diferentes veem o mesmo "hoje":
 * o da clínica (ADR-006).
 */
export default async function TodayPage() {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") redirect("/app");

  const result = await loadAgendaWorkspace({
    clinicId: context.clinic.id,
    timezone: context.clinic.timezone,
  });

  const toolbar = <PageToolbar
    description={<>
      Operação do dia no fuso da clínica
      <span className="hidden sm:inline">{` (${context.clinic.timezone})`}</span>
    </>}
    title="Hoje"
  />;

  if (!result.ok) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        {result.code === "forbidden"
          ? <AccessDeniedState description="A agenda da clínica exige permissão de visualização. Fale com um responsável." />
          : <ErrorState
            description="Não foi possível carregar a agenda de hoje. Tente novamente em alguns instantes."
            title="Agenda indisponível"
          />}
      </div>
    </div>;
  }

  const greetingName = context.clinic.name;

  return <div className="flex min-h-0 flex-1 flex-col">
    {toolbar}
    <div className="scroll-slim min-h-0 flex-1 overflow-auto p-4 sm:p-5">
      <TodayScreen {...result.data} greetingName={greetingName} />
    </div>
  </div>;
}
