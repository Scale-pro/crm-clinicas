import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { resolveActiveClinicContext } from "@/modules/tenancy";
import { ErrorState } from "@/shared/ui/error-state";
import { selectClinicFormAction } from "../actions";
import { AppHeader } from "./_shell/app-header";
import { AppSidebar } from "./_shell/app-sidebar";
import { MobileNavigation } from "./_shell/mobile-navigation";
import type { NavItem } from "./_shell/navigation";

/** Somente áreas já entregues. Conversas, agenda, relatórios, automações e IA
 * entram na navegação junto com a implementação de cada uma. */
const navigation: readonly NavItem[] = [
  { label: "Visão geral", href: "/app", icon: "overview" },
  { label: "Pipeline", href: "/app/pipeline", icon: "pipeline" },
  { label: "Todos os leads", href: "/app/leads", icon: "leads" },
  { label: "Contatos", href: "/app/contacts", icon: "contacts" },
  { label: "Equipe", href: "/app/team", icon: "team" },
  { label: "Configurações", href: "/app/settings", icon: "settings" },
];

const accountNavigation: readonly NavItem[] = [
  { label: "Conta", href: "/app/account", icon: "account" },
  { label: "Segurança", href: "/app/security", icon: "security" },
];

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

  // Apenas o pipeline padrão está disponível hoje; a sidebar já aceita a lista
  // completa quando o contrato de múltiplos pipelines existir.
  const sidebar = <AppSidebar
    accountItems={accountNavigation}
    clinic={context.clinic}
    clinics={context.clinics}
    navigation={navigation}
    selectClinicAction={selectClinicFormAction}
  />;

  return <div className="flex min-h-svh flex-col bg-canvas lg:h-svh lg:flex-row lg:overflow-hidden">
    <a
      className="sr-only left-2 top-2 z-50 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus-visible:not-sr-only focus-visible:fixed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:left-4 sm:top-4"
      href="#main-content"
    >
      Ir para o conteúdo
    </a>
    <div className="hidden w-60 shrink-0 lg:block lg:h-svh">{sidebar}</div>
    <div className="flex min-w-0 flex-1 flex-col lg:h-svh lg:overflow-hidden">
      <AppHeader
        clinicName={context.clinic.name}
        navigation={<MobileNavigation>{sidebar}</MobileNavigation>}
      />
      <main className="flex min-w-0 flex-1 flex-col lg:min-h-0 lg:overflow-y-auto" id="main-content">
        {children}
      </main>
    </div>
  </div>;
}
