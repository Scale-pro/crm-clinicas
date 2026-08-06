import { ChevronRight, MessageCircle, SlidersHorizontal, Stethoscope, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveActiveClinicContext } from "@/modules/tenancy";
import { requirePermission } from "@/shared/auth";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { updateClinicSettingsFormAction } from "../../actions";

/**
 * Cada entrada avançada aparece só para quem tem a permissão correspondente:
 * um link para uma tela que responderia "acesso negado" seria ruído.
 */
type SettingsLink = {
  readonly href: string;
  readonly title: string;
  readonly description: string;
  readonly icon: typeof SlidersHorizontal;
};

export default async function ClinicSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  const [context, query] = await Promise.all([resolveActiveClinicContext(), searchParams]);
  if (context.status !== "ready") redirect("/app");
  const [manageAccess, professionalAccess, procedureAccess, clinicAccess] = await Promise.all([
    requirePermission(context.clinic.id, "pipeline.manage"),
    requirePermission(context.clinic.id, "professional.view"),
    requirePermission(context.clinic.id, "procedure.view"),
    requirePermission(context.clinic.id, "clinic.manage"),
  ]);
  const advancedLinks: readonly SettingsLink[] = [
    ...(manageAccess.allowed ? [{
      description: "Renomeie, reordene e adicione etapas abertas do pipeline padrão.",
      href: "/app/settings/pipeline",
      icon: SlidersHorizontal,
      title: "Etapas do pipeline",
    }] : []),
    ...(professionalAccess.allowed ? [{
      description: "Quem atende na clínica, especialidades e disponibilidade semanal.",
      href: "/app/settings/professionals",
      icon: Users,
      title: "Profissionais",
    }] : []),
    ...(procedureAccess.allowed ? [{
      description: "O que a clínica oferece, com duração padrão e preço-base.",
      href: "/app/settings/procedures",
      icon: Stethoscope,
      title: "Procedimentos",
    }] : []),
    ...(clinicAccess.allowed ? [{
      description: "Instância do provedor que recebe e envia as mensagens da clínica.",
      href: "/app/settings/whatsapp",
      icon: MessageCircle,
      title: "WhatsApp",
    }] : []),
  ];
  return <section className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-5" aria-labelledby="settings-title">
    <div><h1 id="settings-title" className="text-2xl font-semibold">Configurações da clínica</h1><p className="mt-1 text-sm text-muted-foreground">Alterações sensíveis exigem permissão e MFA no servidor.</p></div>
    {query.status === "updated" ? <p role="status" className="rounded-md bg-muted p-3 text-sm">Configurações atualizadas.</p> : null}
    {query.error ? <p id="settings-error" role="alert" className="text-sm text-destructive">Não foi possível atualizar as configurações.</p> : null}
    <form action={updateClinicSettingsFormAction} className="space-y-4 rounded-lg border border-border bg-surface p-5" aria-describedby={query.error ? "settings-error" : undefined}>
      <input type="hidden" name="clinicId" value={context.clinic.id} />
      <label className="grid gap-2 text-sm" htmlFor="clinic-name">Nome<Input id="clinic-name" name="name" defaultValue={context.clinic.name} required minLength={2} /></label>
      <label className="grid gap-2 text-sm" htmlFor="clinic-timezone">Fuso horário<select id="clinic-timezone" name="timezone" defaultValue={context.clinic.timezone} className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><option value="America/Sao_Paulo">Brasília (America/Sao_Paulo)</option><option value="America/Manaus">Manaus (America/Manaus)</option><option value="America/Recife">Recife (America/Recife)</option></select></label>
      <Button type="submit">Salvar configurações</Button>
    </form>
    {advancedLinks.length > 0 ? <nav aria-label="Configurações avançadas" className="divide-y divide-border rounded-lg border border-border bg-surface">
      {advancedLinks.map(({ href, title, description, icon: Icon }) => <Link
        className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        href={href}
        key={href}
      >
        <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{title}</span>
          <span className="block text-xs text-muted-foreground">{description}</span>
        </span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </Link>)}
    </nav> : null}
  </section>;
}
