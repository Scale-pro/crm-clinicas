import Link from "next/link";
import { redirect } from "next/navigation";

import { listContacts } from "@/modules/crm";
import { resolveActiveClinicContext } from "@/modules/tenancy";
import { requirePermission } from "@/shared/auth";
import { ErrorState } from "@/shared/ui/error-state";
import { ContactForm } from "./contact-form";

const messages: Record<string, string> = {
  duplicate: "Esse telefone ou e-mail já pertence a outro contato ativo.",
  forbidden: "Você não tem permissão para criar contatos.",
  invalid_input: "Revise os dados informados.",
  unavailable: "Não foi possível salvar agora. Tente novamente.",
};

export default async function NewContactPage({ searchParams }: { searchParams: Promise<{ error?: string; existing?: string }> }) {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") redirect("/app");
  const permission = await requirePermission(context.clinic.id, "contact.create");
  if (!permission.allowed) return <ErrorState title="Acesso negado" description="Seu papel não permite criar contatos." />;
  const existing = await listContacts({ clinicId: context.clinic.id, search: "", includeArchived: false, limit: 100 });
  const { error, existing: existingContactId } = await searchParams;
  return <section className="mx-auto max-w-2xl space-y-5"><div><Link className="text-sm underline" href="/app/contacts">Voltar para contatos</Link><h1 className="mt-2 text-2xl font-semibold">Novo contato</h1></div>{error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert"><p>{messages[error] ?? messages.unavailable}</p>{existingContactId ? <Link className="mt-2 inline-block font-medium underline" href={`/app/contacts/${encodeURIComponent(existingContactId)}`}>Abrir contato existente</Link> : null}</div> : null}<ContactForm clinicId={context.clinic.id} existingNames={existing.ok ? existing.contacts.map((contact) => ({ id: contact.id, name: contact.full_name })) : []} idempotencyKey={crypto.randomUUID()} /></section>;
}
