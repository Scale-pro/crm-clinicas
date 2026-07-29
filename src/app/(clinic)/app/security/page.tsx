import Link from "next/link";
import { getMfaState } from "@/modules/identity";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";
import { removeMfaFormAction } from "../../actions";

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  const [state, query] = await Promise.all([getMfaState(), searchParams]);
  if (!state.ok) return <div className="p-4 sm:p-5"><ErrorState title="Não foi possível carregar a segurança da conta" description="Tente novamente em alguns instantes." /></div>;
  return <section className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-5" aria-labelledby="security-title">
    <div><h1 id="security-title" className="text-2xl font-semibold">Segurança e MFA</h1><p className="mt-1 text-sm text-muted-foreground">Nível atual da sessão: {(state.aal ?? "aal1").toUpperCase()}.</p></div>
    {query.status ? <p role="status" className="rounded-md bg-muted p-3 text-sm">Fator removido.</p> : null}
    {query.error ? <p role="alert" className="text-sm text-destructive">Não foi possível alterar o fator. Contas obrigadas a usar MFA devem manter pelo menos um.</p> : null}
    <div className="max-w-xl space-y-4 rounded-xl border bg-background p-6">
      <h2 className="font-semibold">Autenticadores cadastrados</h2>
      {state.factors.length ? <ul className="space-y-3">{state.factors.map((factor) => <li key={factor.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><span className="text-sm">{factor.friendlyName ?? "Autenticador TOTP"}</span><form action={removeMfaFormAction}><input type="hidden" name="factorId" value={factor.id} /><Button type="submit" size="sm" variant="outline">Remover</Button></form></li>)}</ul> : <p className="text-sm text-muted-foreground">Nenhum autenticador verificado.</p>}
      <Button asChild variant="outline"><Link href="/mfa?next=%2Fapp%2Fsecurity">Configurar ou verificar MFA</Link></Button>
    </div>
  </section>;
}
