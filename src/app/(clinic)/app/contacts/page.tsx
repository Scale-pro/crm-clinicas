import Link from "next/link";
import { redirect } from "next/navigation";

import { listContactOwners, listContacts } from "@/modules/crm";
import { resolveActiveClinicContext } from "@/modules/tenancy";
import { requirePermission } from "@/shared/auth";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { Input } from "@/shared/ui/input";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") redirect("/app");
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : "";
  const owner = typeof params.owner === "string" ? params.owner : "";
  const includeArchived = params.archived === "1";
  const [result, owners, createPermission, archivePermission] = await Promise.all([
    listContacts({ clinicId: context.clinic.id, search, ownerUserId: owner || null, includeArchived, limit: 50 }),
    listContactOwners(context.clinic.id),
    requirePermission(context.clinic.id, "contact.create"),
    requirePermission(context.clinic.id, "contact.archive"),
  ]);
  if (!result.ok) return <ErrorState title="Não foi possível carregar os contatos" description="Confira suas permissões ou tente novamente." />;
  const ownerOptions = owners.ok ? owners.owners : [];
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Contatos</h1><p className="text-sm text-muted-foreground">Pessoas visíveis no seu escopo de acesso.</p></div>{createPermission.allowed ? <Button asChild><Link href="/app/contacts/new">Novo contato</Link></Button> : null}</div>
    <form className="grid gap-3 rounded-lg border bg-background p-4 sm:grid-cols-[1fr_14rem_auto]" method="get">
      <div><label className="mb-1 block text-sm font-medium" htmlFor="q">Pesquisar</label><Input defaultValue={search} id="q" name="q" placeholder="Nome, telefone ou e-mail exato" /></div>
      <div><label className="mb-1 block text-sm font-medium" htmlFor="owner">Responsável</label><select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" defaultValue={owner} id="owner" name="owner"><option value="">Todos permitidos</option>{ownerOptions.map((item) => <option key={item.userId} value={item.userId}>{item.fullName}</option>)}</select></div>
      <div className="flex items-end gap-3"><Button type="submit">Buscar</Button>{archivePermission.allowed ? <label className="flex h-9 items-center gap-2 text-sm"><input defaultChecked={includeArchived} name="archived" type="checkbox" value="1" /> Arquivados</label> : null}</div>
    </form>
    {result.contacts.length === 0 ? <EmptyState title="Nenhum contato encontrado" description="Ajuste a busca ou crie a primeira pessoa da clínica." /> : <div className="overflow-x-auto rounded-lg border bg-background"><table className="w-full text-left text-sm"><thead className="border-b bg-muted/50"><tr><th className="px-4 py-3">Nome</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">Estado</th></tr></thead><tbody>{result.contacts.map((contact) => <tr className="border-b last:border-0" key={contact.id}><td className="px-4 py-3"><Link className="font-medium underline-offset-4 hover:underline focus-visible:outline-2" href={`/app/contacts/${contact.id}`}>{contact.full_name}</Link></td><td className="px-4 py-3 text-muted-foreground">{ownerOptions.find((item) => item.userId === contact.owner_user_id)?.fullName ?? "Sem responsável"}</td><td className="px-4 py-3">{contact.archived_at ? "Arquivado" : "Ativo"}</td></tr>)}</tbody></table></div>}
    <p className="text-xs text-muted-foreground" role="status">Exibindo até 50 registros. Escopo: {result.scope === "all" ? "toda a clínica" : "somente seus contatos"}.</p>
  </section>;
}
