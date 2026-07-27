import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { forgotPasswordFormAction } from "../actions";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  const query = await searchParams;
  return <section className="space-y-6" aria-labelledby="forgot-title">
    <div className="space-y-2"><h1 id="forgot-title" className="text-2xl font-semibold">Recuperar senha</h1><p className="text-sm text-muted-foreground">Enviaremos instruções quando a conta puder receber a solicitação.</p></div>
    {query.status === "sent" ? <p role="status" className="rounded-md bg-muted p-3 text-sm">Se o e-mail estiver cadastrado, as instruções serão enviadas.</p> : null}
    {query.error ? <p id="forgot-error" role="alert" className="text-sm text-destructive">Não foi possível processar a solicitação.</p> : null}
    <form action={forgotPasswordFormAction} className="space-y-4">
      <label className="grid gap-2 text-sm" htmlFor="email">E-mail<Input id="email" name="email" type="email" autoComplete="email" required /></label>
      <Button className="w-full" type="submit">Enviar instruções</Button>
    </form>
    <Link className="text-sm underline underline-offset-4" href="/login">Voltar para entrar</Link>
  </section>;
}
