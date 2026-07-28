import { LogOut } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import { SidebarClinicSwitcher } from "./clinic-switcher";
import type { NavItem, PipelineNavItem } from "./navigation";
import { SidebarNav, sidebarItemClassName } from "./sidebar-nav";

type SidebarClinic = { readonly id: string; readonly name: string };

/**
 * Sidebar do CRM: marca, navegação das áreas entregues e rodapé com clínica
 * ativa, conta e saída. É usada tanto na coluna fixa do desktop quanto dentro
 * do drawer do mobile.
 */
export function AppSidebar({
  accountItems,
  clinic,
  clinics,
  navigation,
  pipelines,
  selectClinicAction,
  className,
}: {
  accountItems: readonly NavItem[];
  clinic: SidebarClinic;
  clinics: readonly SidebarClinic[];
  navigation: readonly NavItem[];
  pipelines?: readonly PipelineNavItem[];
  selectClinicAction: (formData: FormData) => void | Promise<void>;
  className?: string;
}) {
  return <div className={cn("flex h-full min-h-0 w-full flex-col bg-sidebar text-sidebar-foreground", className)}>
    <div className="flex h-[var(--app-header-height)] shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
      <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-md bg-accent text-[0.6875rem] font-bold text-accent-foreground">CC</span>
      <span className="truncate text-sm font-semibold tracking-tight">CRM Clínicas</span>
    </div>

    <SidebarNav
      className="min-h-0 flex-1 overflow-y-auto py-3"
      items={navigation}
      pipelines={pipelines}
    />

    <div className="shrink-0 border-t border-sidebar-border">
      <div className="px-4 py-3">
        {clinics.length > 1
          ? <SidebarClinicSwitcher action={selectClinicAction} activeClinicId={clinic.id} clinics={clinics} />
          : <div className="min-w-0">
            <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-sidebar-muted-foreground">Clínica ativa</p>
            <p className="truncate text-sm font-medium">{clinic.name}</p>
          </div>}
      </div>
      <SidebarNav
        className="border-t border-sidebar-border py-2"
        items={accountItems}
        label="Conta e sessão"
      />
      <form action="/auth/logout" className="border-t border-sidebar-border px-2 py-2" method="post">
        <button className={cn(sidebarItemClassName, "w-full")} type="submit">
          <LogOut aria-hidden="true" className="size-4 shrink-0" />
          Sair
        </button>
      </form>
    </div>
  </div>;
}
