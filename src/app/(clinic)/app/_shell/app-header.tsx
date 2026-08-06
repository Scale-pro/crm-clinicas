"use client";

import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const sectionLabels: ReadonlyArray<readonly [string, string]> = [
  ["/app/settings/pipeline", "Configurações · Etapas do pipeline"],
  ["/app/settings/whatsapp", "Configurações · WhatsApp"],
  ["/app/opportunities", "Oportunidade"],
  ["/app/pipeline", "Pipeline"],
  ["/app/leads", "Todos os leads"],
  ["/app/contacts", "Contatos"],
  ["/app/team", "Equipe"],
  ["/app/settings", "Configurações"],
  ["/app/security", "Segurança"],
  ["/app/account", "Conta"],
  ["/app", "Visão geral"],
];

function sectionLabel(pathname: string): string {
  const match = sectionLabels.find(([href]) => pathname === href || pathname.startsWith(`${href}/`));
  return match?.[1] ?? "Visão geral";
}

/**
 * Cabeçalho da área de trabalho: contexto atual e acesso à navegação no
 * mobile. Compacto por definição — cada tela traz sua própria barra de ações.
 */
export function AppHeader({ clinicName, navigation, actions }: {
  clinicName: string;
  navigation: ReactNode;
  actions?: ReactNode;
}) {
  const pathname = usePathname() ?? "/app";
  return <header className="sticky top-0 z-30 flex h-[var(--app-header-height)] shrink-0 items-center gap-2 border-b border-border bg-surface px-2 sm:px-4">
    {navigation}
    <nav aria-label="Trilha de navegação" className="flex min-w-0 items-center gap-1 text-sm">
      <span className="hidden max-w-[14rem] truncate text-muted-foreground sm:inline">{clinicName}</span>
      <ChevronRight aria-hidden="true" className="hidden size-3.5 shrink-0 text-muted-foreground sm:inline" />
      <span aria-current="page" className="truncate font-medium">{sectionLabel(pathname)}</span>
    </nav>
    {actions ? <div className="ms-auto flex items-center gap-2">{actions}</div> : null}
  </header>;
}
