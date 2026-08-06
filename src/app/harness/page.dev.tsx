// Harness visual — ferramenta de desenvolvimento, não faz parte do produto.
// Ver docs/runbooks/visual-harness.md.
//
// A extensão `.dev.tsx` só é registrada como página em desenvolvimento
// (next.config.ts), então em qualquer outro ambiente este arquivo nem sequer é
// uma rota. A guarda em `notFound()` abaixo é a segunda linha de defesa, para
// o caso de alguém reintroduzir a extensão no build.
"use client";

import { notFound } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AgendaScreen } from "../(clinic)/app/_agenda/agenda-screen";
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
const SCENARIOS = ["grid", "empty", "no-professionals"] as const;

function Harness() {
  const params = useSearchParams();
  const dark = params.get("theme") === "dark";
  const requested = params.get("scenario") ?? "grid";
  const scenario = (SCENARIOS as readonly string[]).includes(requested) ? requested : "grid";

  const appointments = scenario === "empty" ? [] : APPOINTMENTS;
  const professionals = scenario === "no-professionals" ? [] : PROFESSIONALS;

  return <div className={dark ? "dark" : undefined}>
    <div className="flex min-h-screen flex-col bg-canvas p-4 text-foreground">
      <AgendaScreen
        appointments={appointments}
        canCreateContact
        canManage
        contacts={CONTACTS}
        dayKey={DAY_KEY}
        nowIso={NOW_ISO}
        procedures={PROCEDURES}
        professionals={professionals}
        timezone={TIMEZONE}
      />
    </div>
  </div>;
}

export default function HarnessPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Suspense><Harness /></Suspense>;
}
