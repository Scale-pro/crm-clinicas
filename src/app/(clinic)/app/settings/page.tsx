import { redirect } from "next/navigation";

import { resolveActiveClinicContext } from "@/modules/tenancy";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { updateClinicSettingsFormAction } from "../../actions";

export default async function ClinicSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  const [context, query] = await Promise.all([resolveActiveClinicContext(), searchParams]);
  if (context.status !== "ready") redirect("/app");
  return <section className="space-y-6" aria-labelledby="settings-title">
    <div><h1 id="settings-title" className="text-2xl font-semibold">Configurações da clínica</h1><p className="mt-1 text-sm text-muted-foreground">Alterações sensíveis exigem permissão e MFA no servidor.</p></div>
    {query.status === "updated" ? <p role="status" className="rounded-md bg-muted p-3 text-sm">Configurações atualizadas.</p> : null}
    {query.error ? <p id="settings-error" role="alert" className="text-sm text-destructive">Não foi possível atualizar as configurações.</p> : null}
    <form action={updateClinicSettingsFormAction} className="max-w-xl space-y-4 rounded-xl border bg-background p-6" aria-describedby={query.error ? "settings-error" : undefined}>
      <input type="hidden" name="clinicId" value={context.clinic.id} />
      <label className="grid gap-2 text-sm" htmlFor="clinic-name">Nome<Input id="clinic-name" name="name" defaultValue={context.clinic.name} required minLength={2} /></label>
      <label className="grid gap-2 text-sm" htmlFor="clinic-timezone">Fuso horário<select id="clinic-timezone" name="timezone" defaultValue={context.clinic.timezone} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="America/Sao_Paulo">Brasília (America/Sao_Paulo)</option><option value="America/Manaus">Manaus (America/Manaus)</option><option value="America/Recife">Recife (America/Recife)</option></select></label>
      <Button type="submit">Salvar configurações</Button>
    </form>
  </section>;
}
