import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { resetPasswordFormAction } from "../actions";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  return <section className="space-y-6" aria-labelledby="reset-title">
    <div className="space-y-2"><h1 id="reset-title" className="text-2xl font-semibold">Definir nova senha</h1><p className="text-sm text-muted-foreground">Escolha uma senha exclusiva para sua conta.</p></div>
    {query.error ? <p id="reset-error" role="alert" className="text-sm text-destructive">Não foi possível atualizar a senha.</p> : null}
    <form action={resetPasswordFormAction} className="space-y-4">
      <label className="grid gap-2 text-sm" htmlFor="password">Nova senha<Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} /></label>
      <Button className="w-full" type="submit">Atualizar senha</Button>
    </form>
  </section>;
}
