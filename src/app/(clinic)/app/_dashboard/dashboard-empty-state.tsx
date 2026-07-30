import Link from "next/link";

import { buttonVariants } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";

/**
 * Clínica sem nenhuma oportunidade no pipeline padrão: em vez de indicadores
 * zerados sem contexto, a visão geral explica o estado e leva ao quadro.
 */
export function DashboardEmptyState() {
  return <EmptyState
    action={<Link className={buttonVariants({ size: "sm" })} href="/app/pipeline">
      Ir para o pipeline
    </Link>}
    description="Assim que a primeira oportunidade for criada no pipeline, os indicadores desta página passam a ser calculados automaticamente."
    title="Ainda não há oportunidades nesta pipeline."
  />;
}

/** Aviso de conjunto parcial: métricas globais dependem de dados completos. */
export function PartialDataNotice({ children }: { children: string }) {
  return <p
    className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-strong"
    role="status"
  >
    {children}
  </p>;
}
