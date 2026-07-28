import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getContact, listContactOwners, requireContactEditAccess } from "@/modules/crm";
import { resolveActiveClinicContext } from "@/modules/tenancy";
import { requirePermission } from "@/shared/auth";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";
import { archiveContactFormAction } from "../actions";

export default async function ContactPage({ params, searchParams }: { params: Promise<{ contactId: string }>; searchParams: Promise<{ error?: string; status?: string }> }) {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") redirect("/app");
  const { contactId } = await params;
  const [result, owners, editAccess, archivePermission] = await Promise.all([
    getContact({ clinicId: context.clinic.id, contactId }),
    listContactOwners(context.clinic.id),
    requireContactEditAccess(context.clinic.id, contactId),
    requirePermission(context.clinic.id, "contact.archive"),
  ]);
  if (!result.ok) {
    if (result.code === "not_found" || result.code === "forbidden") notFound();
    return <ErrorState title="Não foi possível carregar o contato" description="Tente novamente em instantes." />;
  }
  const query = await searchParams;
  const owner = owners.ok ? owners.owners.find((item) => item.userId === result.contact.owner_user_id) : null;
  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><Link className="text-sm underline" href="/app/contacts">Voltar para contatos</Link><h1 className="mt-2 text-2xl font-semibold">{result.contact.full_name}</h1><p className="text-sm text-muted-foreground">{result.contact.archived_at ? "Contato arquivado" : "Contato ativo"}</p></div><div className="flex gap-2">{editAccess.ok ? <Button asChild variant="outline"><Link href={`/app/contacts/${contactId}/edit`}>Editar</Link></Button> : null}{archivePermission.allowed && !result.contact.archived_at ? <form action={archiveContactFormAction}><input name="clinicId" type="hidden" value={context.clinic.id} /><input name="contactId" type="hidden" value={contactId} /><Button type="submit" variant="destructive">Arquivar</Button></form> : null}</div></div>
    {query.status ? <p className="rounded-md border bg-muted p-3 text-sm" role="status">Alteração concluída.</p> : null}{query.error ? <p className="rounded-md border border-destructive/30 p-3 text-sm text-destructive" role="alert">Não foi possível concluir a ação.</p> : null}
    <div className="grid gap-4 sm:grid-cols-3"><div className="rounded-lg border bg-background p-4"><h2 className="text-sm font-medium">Responsável</h2><p className="mt-1 text-sm text-muted-foreground">{owner?.fullName ?? "Sem responsável"}</p></div><div className="rounded-lg border bg-background p-4"><h2 className="text-sm font-medium">Paciente</h2><p className="mt-1 text-sm text-muted-foreground">{result.patient ? "Vinculado" : "Não vinculado"}</p></div><div className="rounded-lg border bg-background p-4"><h2 className="text-sm font-medium">Versão</h2><p className="mt-1 text-sm text-muted-foreground">{result.contact.version}</p></div></div>
    <div className="rounded-lg border bg-background p-4"><h2 className="font-semibold">Notas</h2><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{result.contact.notes || "Nenhuma nota cadastrada."}</p></div>
    <div className="rounded-lg border bg-background p-4"><h2 className="font-semibold">Meios de contato</h2>{result.methods.filter((method) => !method.archived_at).length ? <ul className="mt-3 space-y-2">{result.methods.filter((method) => !method.archived_at).map((method) => <li className="flex flex-wrap gap-2 text-sm" key={method.id}><span className="font-medium">{method.kind === "phone" ? "Telefone" : "E-mail"}:</span><span>{method.raw_value}</span>{method.label ? <span className="text-muted-foreground">({method.label})</span> : null}{method.is_primary ? <span className="rounded bg-muted px-2">Principal</span> : null}{method.is_whatsapp ? <span className="rounded bg-muted px-2">WhatsApp</span> : null}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Nenhum meio ativo.</p>}</div>
    <div className="rounded-lg border bg-background p-4"><h2 className="font-semibold">Histórico básico</h2>{result.activities.length ? <ul className="mt-3 space-y-2">{result.activities.map((activity) => <li className="text-sm" key={activity.id}><span className="font-medium">{activity.type}</span><span className="ml-2 text-muted-foreground">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: context.clinic.timezone }).format(new Date(activity.occurred_at))}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Nenhuma atividade disponível.</p>}</div>
  </section>;
}
