"use client";

import {
  Building2,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  Settings,
  ShieldCheck,
  Users,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/shared/lib/utils";

import type { NavIconName, NavItem, PipelineNavItem } from "./navigation";

const icons: Record<NavIconName, LucideIcon> = {
  overview: LayoutDashboard,
  pipeline: KanbanSquare,
  leads: ListChecks,
  contacts: Users,
  team: Building2,
  settings: Settings,
  account: UserRound,
  security: ShieldCheck,
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const itemClassName =
  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-sidebar-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring";

export function SidebarNav({ items, label = "Navegação principal", pipelines, className }: {
  items: readonly NavItem[];
  label?: string;
  pipelines?: readonly PipelineNavItem[];
  className?: string;
}) {
  const pathname = usePathname() ?? "";
  return <nav aria-label={label} className={cn("px-2", className)}>
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = icons[item.icon];
        const active = isActive(pathname, item.href);
        return <li key={item.href}>
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(itemClassName, active && "bg-sidebar-active text-sidebar-foreground")}
            href={item.href}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
          {item.icon === "pipeline" && pipelines?.length ? <ul className="mt-0.5 space-y-0.5 border-l border-sidebar-border pl-3 ms-4">
            {pipelines.map((pipeline) => <li key={pipeline.id}>
              <Link
                aria-current={pathname === pipeline.href ? "page" : undefined}
                className={cn(itemClassName, "py-1.5 text-[0.8125rem]", pathname === pipeline.href && "text-sidebar-foreground")}
                href={pipeline.href}
              >
                <span className="truncate">{pipeline.name}</span>
              </Link>
            </li>)}
          </ul> : null}
        </li>;
      })}
    </ul>
  </nav>;
}

export { itemClassName as sidebarItemClassName };
