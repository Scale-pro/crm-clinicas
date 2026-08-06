import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveActiveClinicContext } from "@/modules/tenancy";
import { AccessDeniedState } from "@/shared/ui/access-denied-state";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";
import { PageToolbar } from "@/shared/ui/page-toolbar";

import { loadAgendaWorkspace } from "../_agenda/agenda-data";
import { AgendaScreen } from "../_agenda/agenda-screen";
import { shiftDayKey, zonedDayKey } from "../_agenda/agenda-view-model";

/**
 * Agenda do dia, por profissional.
 *
 * O dia navegável vem da URL (`?dia=YYYY-MM-DD`), mas é validado no servidor e
 * interpretado no fuso da clínica. Um valor fora do formato cai no dia corrente
 * da clínica em vez de virar erro — navegação nunca deve quebrar a tela.
 */

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `dayKey` já é uma data civil: formatada em UTC para não deslocar o dia. */
function longDayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export default async function AgendaPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [context, params] = await Promise.all([resolveActiveClinicContext(), searchParams]);
  if (context.status !== "ready") redirect("/app");

  const timezone = context.clinic.timezone;
  const today = zonedDayKey(new Date(), timezone);
  const requested = typeof params.dia === "string" ? params.dia : "";
  const dayKey = DAY_PATTERN.test(requested) && !Number.isNaN(Date.parse(requested))
    ? requested
    : today;

  const result = await loadAgendaWorkspace({
    clinicId: context.clinic.id,
    dayKey,
    timezone,
  });

  const dayHref = (target: string) => target === today ? "/app/agenda" : `/app/agenda?dia=${target}`;

  const toolbar = <PageToolbar
    actions={<div className="flex items-center gap-1">
      <Button asChild size="icon" variant="outline">
        <Link aria-label="Dia anterior" href={dayHref(shiftDayKey(dayKey, -1))}>
          <ChevronLeft aria-hidden="true" />
        </Link>
      </Button>
      <Button asChild size="sm" variant={dayKey === today ? "secondary" : "outline"}>
        <Link href="/app/agenda">Hoje</Link>
      </Button>
      <Button asChild size="icon" variant="outline">
        <Link aria-label="Próximo dia" href={dayHref(shiftDayKey(dayKey, 1))}>
          <ChevronRight aria-hidden="true" />
        </Link>
      </Button>
    </div>}
    description={<>
      {longDayLabel(dayKey)}
      {/* O fuso é contexto, não o assunto da linha: abaixo de `sm` ele sai
          inteiro em vez de truncar no meio da palavra. */}
      <span className="hidden sm:inline">{` · fuso ${timezone}`}</span>
    </>}
    title="Agenda"
  />;

  if (!result.ok) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        {result.code === "forbidden"
          ? <AccessDeniedState description="A agenda da clínica exige permissão de visualização. Fale com um responsável." />
          : <ErrorState
            description="Não foi possível carregar os agendamentos deste dia. Tente novamente em alguns instantes."
            title="Agenda indisponível"
          />}
      </div>
    </div>;
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    {toolbar}
    <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
      <AgendaScreen {...result.data} />
    </div>
  </div>;
}
