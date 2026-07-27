import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { updatePasswordFormAction } from "../../actions";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  const query = await searchParams;
  return <section className="space-y-6" aria-labelledby="account-title">
    <div><h1 id="account-title" className="text-2xl font-semibold">Conta</h1><p className="mt-1 text-sm text-muted-foreground">Gerencie as credenciais da sua própria conta.</p></div>
    {query.status === "password_updated" ? <p role="status" className="rounded-md bg-muted p-3 text-sm">Senha atualizada.</p> : null}
    {query.error ? <p id="account-error" role="alert" className="text-sm text-destructive">Não foi possível atualizar a senha.</p> : null}
    <form action={updatePasswordFormAction} className="max-w-xl space-y-4 rounded-xl border bg-background p-6" aria-describedby={query.error ? "account-error" : undefined}>
      <label className="grid gap-2 text-sm" htmlFor="account-password">Nova senha<Input id="account-password" name="password" type="password" autoComplete="new-password" required minLength={12} /></label>
      <Button type="submit">Atualizar senha</Button>
    </form>
  </section>;
}
