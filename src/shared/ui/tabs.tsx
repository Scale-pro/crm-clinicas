"use client";

import { useId, useRef, useState, type ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

export type TabDefinition = {
  readonly key: string;
  readonly label: string;
  /** Contagem opcional exibida ao lado do rótulo (também lida em texto). */
  readonly count?: number;
  readonly content: ReactNode;
};

/**
 * Abas com o padrão ARIA completo: `tablist` com foco itinerante, setas para
 * navegar, Home/End para as pontas e apenas o painel ativo montado. O rótulo
 * do conjunto vem de `label` — nunca fica implícito.
 */
export function Tabs({ tabs, label, defaultTabKey, className }: {
  tabs: readonly TabDefinition[];
  label: string;
  defaultTabKey?: string;
  className?: string;
}) {
  const baseId = useId();
  const firstKey = tabs[0]?.key ?? "";
  const [activeKey, setActiveKey] = useState(defaultTabKey ?? firstKey);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.key === activeKey));
  const active = tabs[activeIndex];

  function focusTab(index: number) {
    const target = tabs[((index % tabs.length) + tabs.length) % tabs.length];
    if (!target) return;
    setActiveKey(target.key);
    tabRefs.current.get(target.key)?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowRight") focusTab(activeIndex + 1);
    else if (event.key === "ArrowLeft") focusTab(activeIndex - 1);
    else if (event.key === "Home") focusTab(0);
    else if (event.key === "End") focusTab(tabs.length - 1);
    else return;
    event.preventDefault();
  }

  return <div className={cn("flex min-h-0 flex-col", className)}>
    <div
      aria-label={label}
      className="scroll-slim -mx-1 flex gap-1 overflow-x-auto border-b border-border px-1"
      role="tablist"
    >
      {tabs.map((tab) => {
        const selected = tab.key === active?.key;
        return <button
          aria-controls={`${baseId}-panel-${tab.key}`}
          aria-selected={selected}
          className={cn(
            "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            selected
              ? "border-accent text-foreground"
              : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
          )}
          id={`${baseId}-tab-${tab.key}`}
          key={tab.key}
          onClick={() => setActiveKey(tab.key)}
          onKeyDown={onKeyDown}
          ref={(node) => {
            if (node) tabRefs.current.set(tab.key, node);
            else tabRefs.current.delete(tab.key);
          }}
          role="tab"
          tabIndex={selected ? 0 : -1}
          type="button"
        >
          {tab.label}
          {typeof tab.count === "number"
            ? <span className="rounded-full bg-muted px-1.5 text-[0.6875rem] font-semibold leading-4 tabular-nums text-muted-foreground">{tab.count}</span>
            : null}
        </button>;
      })}
    </div>
    {active ? <div
      aria-labelledby={`${baseId}-tab-${active.key}`}
      className="min-h-0 flex-1 pt-4"
      id={`${baseId}-panel-${active.key}`}
      role="tabpanel"
      tabIndex={0}
    >
      {active.content}
    </div> : null}
  </div>;
}
