import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { registerFormAction } from "../actions";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  return <section className="space-y-6" aria-labelledby="register-title">
    <div className="space-y-2"><h1 id="register-title" className="text-2xl font-semibold">Criar conta</h1><p className="text-sm text-muted-foreground">Comece pela identidade do responsável da clínica.</p></div>
    {query.error ? <p id="register-error" role="alert" className="text-sm text-destructive">Não foi possível concluir o cadastro.</p> : null}
    <form action={registerFormAction} className="space-y-4" aria-describedby={query.error ? "register-error" : undefined}>
      <label className="grid gap-2 text-sm" htmlFor="fullName">Nome completo<Input id="fullName" name="fullName" autoComplete="name" required minLength={2} /></label>
      <label className="grid gap-2 text-sm" htmlFor="email">E-mail<Input id="email" name="email" type="email" autoComplete="email" required /></label>
      <label className="grid gap-2 text-sm" htmlFor="password">Senha<Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} /><span className="text-xs text-muted-foreground">Use pelo menos 12 caracteres.</span></label>
      <Button className="w-full" type="submit">Criar conta</Button>
    </form>
    <Link className="text-sm underline underline-offset-4" href="/login">Já tenho uma conta</Link>
  </section>;
}
