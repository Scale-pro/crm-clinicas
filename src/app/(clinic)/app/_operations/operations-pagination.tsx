import Link from "next/link";

import { Button } from "@/shared/ui/button";

/**
 * Paginação das listagens de operações.
 *
 * A navegação acontece por links reais: a página seguinte é resolvida no
 * servidor, com os mesmos filtros preservados na query string. O total vem do
 * contrato de listagem, então "última página" é uma afirmação verificada, não
 * uma suposição a partir do tamanho da página recebida.
 */
export function OperationsPagination({
  label,
  page,
  pageSize,
  total,
  previousHref,
  nextHref,
}: {
  label: string;
  page: number;
  pageSize: number;
  total: number;
  previousHref: string;
  nextHref: string;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const hasPrevious = page > 1;
  const hasNext = page < lastPage;

  if (!hasPrevious && !hasNext) return null;

  return <nav
    aria-label={label}
    className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"
  >
    {hasPrevious
      ? <Button asChild size="sm" variant="outline"><Link href={previousHref}>Anterior</Link></Button>
      : <Button disabled size="sm" variant="outline">Anterior</Button>}
    <p className="text-xs text-muted-foreground" role="status">
      Página {page} de {lastPage} · {total} registro(s)
    </p>
    {hasNext
      ? <Button asChild size="sm" variant="outline"><Link href={nextHref}>Próxima</Link></Button>
      : <Button disabled size="sm" variant="outline">Próxima</Button>}
  </nav>;
}
