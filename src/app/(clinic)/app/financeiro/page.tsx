import { redirect } from "next/navigation";

import { resolveActiveClinicContext } from "@/modules/tenancy";
import { AccessDeniedState } from "@/shared/ui/access-denied-state";
import { ErrorState } from "@/shared/ui/error-state";
import { PageToolbar } from "@/shared/ui/page-toolbar";

import { loadAgendaWorkspace } from "../_agenda/agenda-data";
import { zonedDayKey } from "../_agenda/agenda-view-model";
import { FinanceiroScreen } from "../_agenda/financeiro-screen";

/**
 * Financeiro do mês corrente da clínica.
 *
 * O período é o mês civil da clínica, não do servidor. A leitura reaproveita o
 * mesmo carregamento da agenda — o financeiro é uma leitura derivada dos
 * agendamentos, não uma segunda fonte de verdade.
 */
export default async function FinanceiroPage() {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") redirect("/app");

  const timezone = context.clinic.timezone;
  const today = zonedDayKey(new Date(), timezone);
  const [year, month] = today.split("-").map(Number) as [number, number];
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const result = await loadAgendaWorkspace({
    clinicId: context.clinic.id,
    dayKey: monthStart,
    days: daysInMonth,
    timezone,
  });

  const periodLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));

  const toolbar = <PageToolbar
    description={`${periodLabel} · derivado dos agendamentos, no fuso ${timezone}`}
    title="Financeiro"
  />;

  if (!result.ok) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        {result.code === "forbidden"
          ? <AccessDeniedState description="O financeiro deriva da agenda e exige permissão de visualização de agendamentos." />
          : <ErrorState
            description="Não foi possível carregar os dados do mês. Tente novamente em alguns instantes."
            title="Financeiro indisponível"
          />}
      </div>
    </div>;
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    {toolbar}
    <div className="scroll-slim min-h-0 flex-1 overflow-auto p-4 sm:p-5">
      <FinanceiroScreen
        appointments={result.data.appointments}
        periodLabel={periodLabel}
        timezone={timezone}
      />
    </div>
  </div>;
}
