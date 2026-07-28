import Link from "next/link";

import { Button } from "@/shared/ui/button";

/**
 * Paginação server-side compartilhada. A navegação acontece por links reais:
 * a página seguinte é resolvida no servidor, nunca no navegador.
 */
export function PaginationBar({ hasMore, page, previousHref, nextHref, scopeLabel }: {
  hasMore: boolean;
  page: number;
  previousHref: string;
  nextHref: string;
  scopeLabel: string;
}) {
  return <nav
    aria-label="Paginação das oportunidades"
    className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-4 py-2 sm:px-5"
  >
    {page > 1
      ? <Button asChild size="sm" variant="outline"><Link href={previousHref}>Anterior</Link></Button>
      : <Button disabled size="sm" variant="outline">Anterior</Button>}
    <p className="text-xs text-muted-foreground" role="status">
      Página {page}{hasMore ? " — há mais resultados" : " — última página"} · {scopeLabel}
    </p>
    {hasMore
      ? <Button asChild size="sm" variant="outline"><Link href={nextHref}>Próxima</Link></Button>
      : <Button disabled size="sm" variant="outline">Próxima</Button>}
  </nav>;
}
