import { redirect } from "next/navigation";
import { requireSession } from "@/shared/auth";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { onboardingFormAction } from "../actions";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [guard, query] = await Promise.all([requireSession(), searchParams]);
  if (!guard.allowed) redirect("/login?next=%2Fonboarding");
  return <section className="space-y-6" aria-labelledby="onboarding-title">
    <div className="space-y-2"><p className="text-sm font-medium text-muted-foreground">Primeiro acesso</p><h1 id="onboarding-title" className="text-2xl font-semibold">Configure sua clínica</h1><p className="text-sm text-muted-foreground">A criação é atômica e você será registrado como owner.</p></div>
    {query.error ? <p id="onboarding-error" role="alert" className="text-sm text-destructive">Não foi possível criar a clínica. Revise os dados ou tente novamente.</p> : null}
    <form action={onboardingFormAction} className="space-y-4" aria-describedby={query.error ? "onboarding-error" : undefined}>
      <label className="grid gap-2 text-sm" htmlFor="name">Nome da clínica<Input id="name" name="name" required minLength={2} /></label>
      <label className="grid gap-2 text-sm" htmlFor="slug">Identificador<Input id="slug" name="slug" required minLength={3} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /><span className="text-xs text-muted-foreground">Use letras minúsculas, números e hífens.</span></label>
      <label className="grid gap-2 text-sm" htmlFor="timezone">Fuso horário<select id="timezone" name="timezone" defaultValue="America/Sao_Paulo" className="h-9 rounded-md border bg-background px-3 text-sm"><option value="America/Sao_Paulo">Brasília (America/Sao_Paulo)</option><option value="America/Manaus">Manaus (America/Manaus)</option><option value="America/Recife">Recife (America/Recife)</option></select></label>
      <Button className="w-full" type="submit">Criar clínica com segurança</Button>
    </form>
  </section>;
}
