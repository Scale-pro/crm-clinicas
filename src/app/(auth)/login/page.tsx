import Link from "next/link";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

import { loginFormAction } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; status?: string }>;
}) {
  const query = await searchParams;
  return (
    <section className="space-y-6" aria-labelledby="login-title">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">CRM Clínicas</p>
        <h1 id="login-title" className="text-2xl font-semibold">Entrar</h1>
        <p className="text-sm text-muted-foreground">Acesse sua conta com segurança.</p>
      </div>
      {query.status === "confirm_email" ? (
        <p role="status" className="rounded-md bg-muted p-3 text-sm">Confira seu e-mail para confirmar o cadastro.</p>
      ) : null}
      {query.error ? (
        <p id="login-error" role="alert" className="text-sm text-destructive">Não foi possível entrar. Revise os dados e tente novamente.</p>
      ) : null}
      <form action={loginFormAction} className="space-y-4" aria-describedby={query.error ? "login-error" : undefined}>
        <input type="hidden" name="next" value={query.next ?? "/app"} />
        <label className="grid gap-2 text-sm" htmlFor="email">E-mail<Input id="email" name="email" type="email" autoComplete="email" required /></label>
        <label className="grid gap-2 text-sm" htmlFor="password">Senha<Input id="password" name="password" type="password" autoComplete="current-password" required /></label>
        <Button className="w-full" type="submit">Entrar</Button>
      </form>
      <div className="flex flex-wrap justify-between gap-3 text-sm">
        <Link className="underline underline-offset-4" href="/forgot-password">Esqueci minha senha</Link>
        <Link className="underline underline-offset-4" href="/register">Criar conta</Link>
      </div>
    </section>
  );
}
