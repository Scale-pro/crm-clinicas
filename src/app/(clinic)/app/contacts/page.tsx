import { Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listContactOwners, listContacts } from "@/modules/crm";
import { resolveActiveClinicContext } from "@/modules/tenancy";
import { requirePermission } from "@/shared/auth";
import { formatClinicDateTime } from "@/shared/lib/date";
import { AccessDeniedState } from "@/shared/ui/access-denied-state";
import { Button } from "@/shared/ui/button";
import { FeedbackBanner } from "@/shared/ui/feedback-banner";
import { PageToolbar } from "@/shared/ui/page-toolbar";

import { ContactFilterBar } from "../_crm/contact-filters";
import { ContactList } from "../_crm/contact-list";
import { crmErrorMessage } from "../_crm/crm-errors";
import { scopeLabel, type ContactRowView } from "../_crm/crm-view-models";

/**
 * Listagem de contatos.
 *
 * Tenant, permissão e dados são resolvidos no servidor: `clinic_id` vem do
 * contexto ativo (nunca da URL), e o escopo de leitura — toda a clínica ou
 * somente os contatos sob responsabilidade da pessoa — é decidido por
 * `listContacts` a partir de `contact.view_all` / `contact.view_own`.
 *
 * Busca e filtros são aplicados pelo próprio contrato de listagem; nada é
 * filtrado no navegador.
 *
 * **Limitação do contrato:** `search_contacts` aceita apenas `limit`, sem
 * offset nem cursor, então não há paginação real. A tela oferece a quantidade
 * exibida e avisa quando o resultado pode estar truncado, em vez de simular
 * páginas que o backend não sabe entregar.
 */

const CONTACTS_PATH = "/app/contacts";
const LIMIT_OPTIONS = [25, 50, 100] as const;
const DEFAULT_LIMIT = 50;

const SUCCESS_MESSAGES: Readonly<Record<string, string>> = {
  archived: "Contato arquivado.",
  contact_archived: "Contato arquivado.",
  created: "Contato criado.",
  updated: "Contato atualizado.",
};

function stringParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function limitParam(value: string | string[] | undefined): number {
  const parsed = Number(stringParam(value));
  return LIMIT_OPTIONS.includes(parsed as (typeof LIMIT_OPTIONS)[number]) ? parsed : DEFAULT_LIMIT;
}

export default async function ContactsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [context, params] = await Promise.all([resolveActiveClinicContext(), searchParams]);
  if (context.status !== "ready") redirect("/app");
  const clinicId = context.clinic.id;

  const search = stringParam(params.q);
  const owner = stringParam(params.owner);
  const limit = limitParam(params.limit);
  const requestedArchived = stringParam(params.archived) === "1";
  const status = stringParam(params.status);
  const error = stringParam(params.error);

  const [archivePermission, createPermission] = await Promise.all([
    requirePermission(clinicId, "contact.archive"),
    requirePermission(clinicId, "contact.create"),
  ]);
  // O contrato recusa `includeArchived` sem `contact.archive`; respeitamos isso
  // aqui para não transformar um filtro em erro de carregamento.
  const includeArchived = requestedArchived && archivePermission.allowed;

  const [result, owners] = await Promise.all([
    listContacts({ clinicId, includeArchived, limit, ownerUserId: owner || null, search }),
    listContactOwners(clinicId),
  ]);

  const createAction = createPermission.allowed
    ? <Button asChild size="sm"><Link href="/app/contacts/new"><Plus aria-hidden="true" />Novo contato</Link></Button>
    : null;

  const toolbar = <PageToolbar
    actions={createAction}
    description="Pessoas visíveis no seu escopo de acesso."
    title="Contatos"
  />;

  if (!result.ok && result.code === "forbidden") {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        <AccessDeniedState
          action={<Button asChild size="sm" variant="outline"><Link href="/app">Voltar à visão geral</Link></Button>}
          description="Ver contatos exige permissão de visualização. Fale com um responsável da clínica."
        />
      </div>
    </div>;
  }

  const filters = <ContactFilterBar
    basePath={CONTACTS_PATH}
    canIncludeArchived={archivePermission.allowed}
    includeArchived={includeArchived}
    limit={limit}
    limitOptions={LIMIT_OPTIONS}
    ownerUserId={owner}
    owners={owners.ok ? owners.owners : []}
    search={search}
  />;

  const banners = <>
    {status && SUCCESS_MESSAGES[status]
      ? <FeedbackBanner tone="success">{SUCCESS_MESSAGES[status]}</FeedbackBanner>
      : null}
    {error ? <FeedbackBanner tone="error">{crmErrorMessage(error)}</FeedbackBanner> : null}
  </>;

  if (!result.ok) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="scroll-slim min-h-0 flex-1 space-y-3 overflow-auto p-4 sm:p-5">
        {filters}
        {banners}
        <ContactList rows={[]} state="error" />
      </div>
    </div>;
  }

  const rows: readonly ContactRowView[] = result.contacts.map((contact) => ({
    archived: contact.archived_at !== null,
    createdAtLabel: formatClinicDateTime(contact.created_at, context.clinic.timezone),
    fullName: contact.full_name,
    href: `${CONTACTS_PATH}/${encodeURIComponent(contact.id)}`,
    id: contact.id,
    ownerName: contact.owner_user_id === null
      ? null
      : owners.ok
        ? owners.owners.find((item) => item.userId === contact.owner_user_id)?.fullName ?? "Membro da clínica"
        : "Membro da clínica",
  }));

  const hasFilters = search !== "" || owner !== "" || includeArchived;
  const truncated = rows.length === limit;

  return <div className="flex min-h-0 flex-1 flex-col">
    {toolbar}
    <div className="scroll-slim min-h-0 flex-1 space-y-3 overflow-auto p-4 sm:p-5">
      {filters}
      {banners}
      <ContactList
        emptyAction={createAction}
        hasFilters={hasFilters}
        limitNote={truncated
          ? `Exibindo os ${limit} contatos mais recentes deste filtro; pode haver mais. Refine a busca por nome, telefone ou e-mail.`
          : undefined}
        rows={rows}
        scopeNote={scopeLabel(result.scope, "contatos")}
      />
    </div>
  </div>;
}
