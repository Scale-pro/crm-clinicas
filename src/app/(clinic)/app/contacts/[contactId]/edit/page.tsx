import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getContact, listContactOwners, requireContactEditAccess } from "@/modules/crm";
import { resolveActiveClinicContext } from "@/modules/tenancy";
import { requirePermission } from "@/shared/auth";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";
import { Input } from "@/shared/ui/input";
import {
  addContactMethodFormAction,
  archiveContactMethodFormAction,
  assignContactOwnerFormAction,
  changePatientLinkFormAction,
  setPrimaryContactMethodFormAction,
  updateContactFormAction,
  updateContactMethodFormAction,
} from "../../actions";
import { SubmitButton } from "../../submit-button";

const errorMessages: Record<string, string> = {
  conflict: "Este contato foi alterado em outra sessão. Recarregue a ficha antes de tentar novamente.",
  duplicate: "O telefone ou e-mail informado já está em uso nesta clínica.",
  forbidden: "Você não tem permissão para esta alteração.",
  invalid_input: "Revise os campos informados.",
  not_found: "O registro solicitado não está mais disponível.",
  unavailable: "Não foi possível salvar agora.",
};

export default async function EditContactPage({ params, searchParams }: { params: Promise<{ contactId: string }>; searchParams: Promise<{ error?: string; existing?: string }> }) {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") redirect("/app");
  const { contactId } = await params;
  const [result, access, owners, editAll] = await Promise.all([
    getContact({ clinicId: context.clinic.id, contactId }),
    requireContactEditAccess(context.clinic.id, contactId),
    listContactOwners(context.clinic.id),
    requirePermission(context.clinic.id, "contact.edit_all"),
  ]);
  if (!result.ok || !access.ok) {
    if (result.code === "not_found" || result.code === "forbidden" || (!access.ok && access.code === "forbidden")) notFound();
    return <div className="p-4 sm:p-5"><ErrorState title="Não foi possível editar" description="Tente novamente em instantes." /></div>;
  }
  const { error, existing } = await searchParams;
  return <section className="mx-auto w-full max-w-2xl space-y-5 p-4 sm:p-5"><div><Link className="text-sm underline" href={`/app/contacts/${contactId}`}>Voltar para a ficha</Link><h1 className="mt-2 text-2xl font-semibold">Editar {result.contact.full_name}</h1></div>{error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert"><p>{errorMessages[error] ?? errorMessages.unavailable}</p>{existing ? <Link className="mt-2 inline-block font-medium underline" href={`/app/contacts/${encodeURIComponent(existing)}`}>Abrir contato existente</Link> : null}</div> : null}
    <form action={updateContactFormAction} className="space-y-4 rounded-lg border bg-background p-5"><input name="clinicId" type="hidden" value={context.clinic.id} /><input name="contactId" type="hidden" value={contactId} /><input name="expectedVersion" type="hidden" value={result.contact.version} /><div><label className="mb-1 block text-sm font-medium" htmlFor="fullName">Nome</label><Input defaultValue={result.contact.full_name} id="fullName" maxLength={160} minLength={2} name="fullName" required /></div><div><label className="mb-1 block text-sm font-medium" htmlFor="notes">Notas</label><textarea className="min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-2" defaultValue={result.contact.notes ?? ""} id="notes" maxLength={2000} name="notes" /></div><SubmitButton>Salvar dados</SubmitButton></form>
    {editAll.allowed && owners.ok ? <form action={assignContactOwnerFormAction} className="flex flex-wrap items-end gap-3 rounded-lg border bg-background p-5"><input name="clinicId" type="hidden" value={context.clinic.id} /><input name="contactId" type="hidden" value={contactId} /><div className="min-w-64"><label className="mb-1 block text-sm font-medium" htmlFor="ownerUserId">Responsável</label><select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" defaultValue={result.contact.owner_user_id ?? ""} id="ownerUserId" name="ownerUserId" required><option disabled value="">Selecione um membro ativo</option>{owners.owners.map((owner) => <option key={owner.userId} value={owner.userId}>{owner.fullName} — {owner.role}</option>)}</select></div><SubmitButton>Reatribuir</SubmitButton></form> : null}
    <div className="space-y-4 rounded-lg border bg-background p-5"><h2 className="font-semibold">Meios de contato</h2>{result.methods.filter((method) => !method.archived_at).map((method) => <div className="rounded-md border p-4" key={method.id}><form action={updateContactMethodFormAction} className="grid gap-3 sm:grid-cols-[8rem_1fr_10rem_auto]"><input name="clinicId" type="hidden" value={context.clinic.id} /><input name="contactId" type="hidden" value={contactId} /><input name="contactMethodId" type="hidden" value={method.id} /><input name="kind" type="hidden" value={method.kind} /><div><label className="mb-1 block text-xs font-medium" htmlFor={`kind-${method.id}`}>Tipo</label><Input disabled id={`kind-${method.id}`} value={method.kind === "phone" ? "Telefone" : "E-mail"} /></div><div><label className="mb-1 block text-xs font-medium" htmlFor={`raw-${method.id}`}>Valor</label><Input defaultValue={method.raw_value} id={`raw-${method.id}`} name="rawValue" required /></div><div><label className="mb-1 block text-xs font-medium" htmlFor={`label-${method.id}`}>Rótulo</label><Input defaultValue={method.label ?? ""} id={`label-${method.id}`} maxLength={40} name="label" /></div><div className="flex items-end"><Button type="submit" variant="outline">Atualizar</Button></div>{method.kind === "phone" ? <label className="flex items-center gap-2 text-sm"><input defaultChecked={method.is_whatsapp} name="isWhatsapp" type="checkbox" /> WhatsApp</label> : null}</form><div className="mt-3 flex gap-2">{!method.is_primary ? <form action={setPrimaryContactMethodFormAction}><input name="clinicId" type="hidden" value={context.clinic.id} /><input name="contactId" type="hidden" value={contactId} /><input name="contactMethodId" type="hidden" value={method.id} /><Button size="sm" type="submit" variant="outline">Tornar principal</Button></form> : <span className="text-sm text-muted-foreground">Principal</span>}<form action={archiveContactMethodFormAction}><input name="clinicId" type="hidden" value={context.clinic.id} /><input name="contactId" type="hidden" value={contactId} /><input name="contactMethodId" type="hidden" value={method.id} /><Button size="sm" type="submit" variant="ghost">Arquivar meio</Button></form></div></div>)}
      <form action={addContactMethodFormAction} className="grid gap-3 border-t pt-4 sm:grid-cols-[8rem_1fr_10rem_auto]"><input name="clinicId" type="hidden" value={context.clinic.id} /><input name="contactId" type="hidden" value={contactId} /><div><label className="mb-1 block text-xs font-medium" htmlFor="newKind">Tipo</label><select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" id="newKind" name="kind"><option value="phone">Telefone</option><option value="email">E-mail</option></select></div><div><label className="mb-1 block text-xs font-medium" htmlFor="newRaw">Valor</label><Input id="newRaw" name="rawValue" required /></div><div><label className="mb-1 block text-xs font-medium" htmlFor="newLabel">Rótulo</label><Input id="newLabel" maxLength={40} name="label" /></div><div className="flex items-end"><Button type="submit">Adicionar</Button></div><label className="flex items-center gap-2 text-sm"><input name="isPrimary" type="checkbox" /> Principal</label><label className="flex items-center gap-2 text-sm"><input name="isWhatsapp" type="checkbox" /> WhatsApp</label></form>
    </div>
    <form action={changePatientLinkFormAction} className="flex items-center justify-between gap-3 rounded-lg border bg-background p-5"><input name="clinicId" type="hidden" value={context.clinic.id} /><input name="contactId" type="hidden" value={contactId} />{!result.patient ? <input name="link" type="hidden" value="on" /> : null}<div><h2 className="font-semibold">Paciente</h2><p className="text-sm text-muted-foreground">{result.patient ? "Este contato está vinculado como paciente." : "Nenhuma informação clínica será adicionada."}</p></div><Button type="submit" variant="outline">{result.patient ? "Desvincular" : "Vincular"}</Button></form>
  </section>;
}
