import { ChevronRight, KanbanSquare, ListChecks, Users } from "lucide-react";
import Link from "next/link";

const shortcuts = [
  {
    description: "Quadro operacional das oportunidades abertas, por etapa.",
    href: "/app/pipeline",
    icon: KanbanSquare,
    title: "Pipeline",
  },
  {
    description: "Lista completa das oportunidades no seu escopo de acesso.",
    href: "/app/leads",
    icon: ListChecks,
    title: "Todos os leads",
  },
  {
    description: "Pessoas da clínica, com responsável e formas de contato.",
    href: "/app/contacts",
    icon: Users,
    title: "Contatos",
  },
] as const;

export default function ClinicHomePage() {
  return <section aria-labelledby="home-title" className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-5">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight" id="home-title">Visão geral</h1>
      <p className="mt-1 text-sm text-muted-foreground">Atalhos das áreas já disponíveis. Nenhum indicador fictício é exibido aqui.</p>
    </div>
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {shortcuts.map((shortcut) => <li key={shortcut.href}>
        <Link
          className="flex h-full items-start gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          href={shortcut.href}
        >
          <shortcut.icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{shortcut.title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{shortcut.description}</span>
          </span>
          <ChevronRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        </Link>
      </li>)}
    </ul>
    <p className="text-xs text-muted-foreground">
      Conversas, agenda, relatórios e automações aparecerão na navegação assim que forem implementados.
    </p>
  </section>;
}
