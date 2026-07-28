import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { resolveActiveClinicContext } from "@/modules/tenancy";
import { ClinicSelector } from "@/shared/ui/clinic-selector";
import { ErrorState } from "@/shared/ui/error-state";
import { selectClinicFormAction } from "../actions";

const navigation = [
  ["Início", "/app"],
  ["Kanban", "/app/pipeline"],
  ["Contatos", "/app/contacts"],
  ["Configurações", "/app/settings"],
  ["Equipe", "/app/team"],
  ["Segurança", "/app/security"],
  ["Conta", "/app/account"],
] as const;

export default async function ClinicLayout({ children }: { children: ReactNode }) {
  const context = await resolveActiveClinicContext();
  if (context.status === "unauthenticated") redirect("/login?next=%2Fapp");
  if (context.status === "mfa_required") redirect("/mfa?next=%2Fapp");
  if (context.status === "no_memberships") redirect("/onboarding");
  if (context.status === "selection_required") redirect("/select-clinic");
  if (context.status === "unavailable") {
    return <main className="mx-auto max-w-2xl p-6"><ErrorState title="Não foi possível carregar sua área segura" description="Nenhuma permissão foi concedida. Tente novamente em alguns instantes." /></main>;
  }
  if (!context.persisted) {
    redirect(`/active-clinic?clinicId=${encodeURIComponent(context.clinic.id)}&next=%2Fapp`);
  }

  return <div className="min-h-svh bg-muted/30">
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Clínica ativa</p><p className="font-semibold">{context.clinic.name}</p></div>
        {context.clinics.length > 1 ? <div className="w-full lg:max-w-md"><ClinicSelector action={selectClinicFormAction} activeClinicId={context.clinic.id} clinics={context.clinics} /></div> : null}
      </div>
    </header>
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[13rem_1fr]">
      <aside className="space-y-4">
        <nav aria-label="Navegação principal"><ul className="flex flex-wrap gap-2 lg:flex-col">{navigation.map(([label, href]) => <li key={href}><Link className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href={href}>{label}</Link></li>)}</ul></nav>
        <form action="/auth/logout" method="post"><button className="rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/5 focus-visible:outline-2 focus-visible:outline-offset-2" type="submit">Sair</button></form>
      </aside>
      <main id="main-content" className="min-w-0">{children}</main>
    </div>
  </div>;
}
