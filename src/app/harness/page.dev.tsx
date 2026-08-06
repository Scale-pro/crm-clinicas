// Harness visual — ferramenta de desenvolvimento, não faz parte do produto.
// Ver docs/runbooks/visual-harness.md.
//
// A extensão `.dev.tsx` só é registrada como página em desenvolvimento
// (next.config.ts), então em qualquer outro ambiente este arquivo nem sequer é
// uma rota. A guarda em `notFound()` abaixo é a segunda linha de defesa, para
// o caso de alguém reintroduzir a extensão no build.
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { Button } from "@/shared/ui/button";
import { PageToolbar } from "@/shared/ui/page-toolbar";

import { AgendaScreen } from "../(clinic)/app/_agenda/agenda-screen";
import { FinanceiroScreen } from "../(clinic)/app/_agenda/financeiro-screen";
import {
  APPOINTMENTS,
  CONTACTS,
  DAY_KEY,
  NOW_ISO,
  PROCEDURES,
  PROFESSIONALS,
  TIMEZONE,
} from "./fixtures";

/** Cenários disponíveis via `?scenario=`. */
const SCENARIOS = ["grid", "empty", "no-professionals", "financeiro", "financeiro-vazio"] as const;

function Harness() {
  const params = useSearchParams();
  const dark = params.get("theme") === "dark";
  const requested = params.get("scenario") ?? "grid";
  const scenario = (SCENARIOS as readonly string[]).includes(requested) ? requested : "grid";

  const appointments = scenario === "empty" || scenario === "financeiro-vazio" ? [] : APPOINTMENTS;
  const professionals = scenario === "no-professionals" ? [] : PROFESSIONALS;
  const financeiro = scenario.startsWith("financeiro");

  return <div className={dark ? "dark" : undefined}>
    <div className="flex min-h-screen flex-col bg-canvas text-foreground">
      {/* Mesma barra da rota real (`agenda/page.tsx`), para a captura mostrar
          a tela inteira e não só a grade. Os botões de dia ficam inertes aqui:
          navegação de data é responsabilidade da rota, não da tela. */}
      <PageToolbar
        actions={<div className="flex items-center gap-1">
          <Button aria-label="Dia anterior" size="icon" type="button" variant="outline">
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button size="sm" type="button" variant="secondary">Hoje</Button>
          <Button aria-label="Próximo dia" size="icon" type="button" variant="outline">
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>}
        description={financeiro
          ? `06 de agosto de 2026 · derivado dos agendamentos, no fuso ${TIMEZONE}`
          : `quinta-feira, 06 de agosto de 2026 · fuso ${TIMEZONE}`}
        title={financeiro ? "Financeiro" : "Agenda"}
      />
      <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
      {financeiro ? <FinanceiroScreen
        appointments={appointments}
        periodLabel="06 de agosto de 2026"
        timezone={TIMEZONE}
      /> : <AgendaScreen
        appointments={appointments}
        canCreateContact
        canManage
        contacts={CONTACTS}
        dayKey={DAY_KEY}
        nowIso={NOW_ISO}
        procedures={PROCEDURES}
        professionals={professionals}
        timezone={TIMEZONE}
      />}
      </div>
    </div>
  </div>;
}

export default function HarnessPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Suspense><Harness /></Suspense>;
}
