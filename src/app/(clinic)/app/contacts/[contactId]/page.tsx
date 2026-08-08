import { Archive, ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getContact, listContactOwners, requireContactEditAccess } from "@/modules/crm";
import { resolveActiveClinicContext } from "@/modules/tenancy";
import { requirePermission } from "@/shared/auth";
import { formatClinicDateTime } from "@/shared/lib/date";
import { AccessDeniedState } from "@/shared/ui/access-denied-state";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";
import { FeedbackBanner } from "@/shared/ui/feedback-banner";
import { PageToolbar } from "@/shared/ui/page-toolbar";

import { archiveContactAction } from "../../_crm/actions";
import { activityLabel } from "../../_crm/activity-labels";
import { ContactDetail, type ContactActivityView } from "../../_crm/contact-detail";
import { loadContactOpportunities } from "../../_crm/contact-opportunities";
import { crmErrorMessage, mfaHref, requiresMfa } from "../../_crm/crm-errors";
import {
  contactMethodDisplayValue,
  contactMethodKind,
  scopeLabel,
  type ContactMethodView,
} from "../../_crm/crm-view-models";

/**
 * Lead 360 — visão completa do contato.
 *
 * O identificador vem da rota, mas nunca é usado sozinho: toda leitura passa
 * pelos contratos de `@/modules/crm`, que exigem permissão e escopam a consulta
 * pela clínica ativa resolvida no servidor. Um identificador de outra clínica
 * resulta em "não encontrado", nunca em dados alheios.
 */

const CONTACTS_PATH = "/app/contacts";

const SUCCESS_MESSAGES: Readonly<Record<string, string>> = {
  archived: "Contato arquivado.",
  contact_archived: "Contato arquivado.",
  created: "Contato criado.",
  updated: "Contato atualizado.",
};

export default async function ContactDetailPage({ params, searchParams }: {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<{ error?: string; status?: string; tab?: string }>;
}) {
  const [context, route, query] = await Promise.all([
    resolveActiveClinicContext(),
    params,
    searchParams,
  ]);
  if (context.status !== "ready") redirect("/app");
  const clinicId = context.clinic.id;
  const { contactId } = route;
  const detailPath = `${CONTACTS_PATH}/${encodeURIComponent(contactId)}`;

  const result = await getContact({ clinicId, contactId });

  const toolbar = <PageToolbar
    actions={<Button asChild size="sm" variant="outline">
      <Link href={CONTACTS_PATH}><ArrowLeft aria-hidden="true" />Contatos</Link>
    </Button>}
    description="Dados de contato, oportunidades e histórico da pessoa."
    title="Contato"
  />;

  if (!result.ok) {
    if (result.code === "not_found" || result.code === "invalid_input") notFound();
    if (result.code === "forbidden") {
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
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        <ErrorState
          description="Tente novamente em alguns instantes."
          title="Não foi possível carregar o contato"
        />
      </div>
    </div>;
  }

  const [owners, editAccess, archivePermission, opportunities] = await Promise.all([
    listContactOwners(clinicId),
    requireContactEditAccess(clinicId, contactId),
    requirePermission(clinicId, "contact.archive"),
    loadContactOpportunities({ clinicId, contactId, timezone: context.clinic.timezone }),
  ]);

  const contact = result.contact;
  const methods: readonly ContactMethodView[] = result.methods
    .filter((method) => method.archived_at === null)
    .map((method) => ({
      displayValue: contactMethodDisplayValue(method.kind, method.raw_value),
      id: method.id,
      isPrimary: method.is_primary,
      isWhatsapp: method.is_whatsapp,
      kind: contactMethodKind(method.kind),
      label: method.label,
      rawValue: method.raw_value,
    }));

  const activities: readonly ContactActivityView[] = result.activities.map((activity) => ({
    id: activity.id,
    label: activityLabel(activity.type),
    occurredAtLabel: formatClinicDateTime(activity.occurred_at, context.clinic.timezone),
  }));

  const ownerName = contact.owner_user_id === null
    ? null
    : owners.ok
      ? owners.owners.find((item) => item.userId === contact.owner_user_id)?.fullName ?? "Membro da clínica"
      : "Membro da clínica";

  // Falha de leitura não vira lista vazia: `null` diz "não carregou", e a aba
  // mostra o erro em vez de afirmar que o contato não tem oportunidades.
  const opportunityRows = opportunities.status === "ok" ? opportunities.rows : null;
  const opportunitiesNote = opportunities.status === "ok"
    ? [
      scopeLabel(opportunities.scope, "oportunidades"),
      opportunities.complete
        ? ""
        : "A busca do quadro não filtra por contato, então esta lista pode estar incompleta em clínicas com muitas oportunidades.",
    ].filter(Boolean).join(" ")
    : opportunities.status === "forbidden"
      ? "Você não tem permissão para ver oportunidades nesta clínica."
      : undefined;

  const actions = <>
    {editAccess.ok ? <Button asChild size="sm" variant="outline">
      <Link href={`${detailPath}/edit`}><Pencil aria-hidden="true" />Editar</Link>
    </Button> : null}
    {archivePermission.allowed && contact.archived_at === null
      ? <form action={archiveContactAction}>
        <input name="contactId" type="hidden" value={contact.id} />
        <Button size="sm" type="submit" variant="outline">
          <Archive aria-hidden="true" />
          Arquivar
        </Button>
      </form>
      : null}
  </>;

  const error = query.error ?? "";

  return <div className="flex min-h-0 flex-1 flex-col">
    {toolbar}
    <div className="scroll-slim min-h-0 flex-1 space-y-3 overflow-auto p-4 sm:p-5">
      {query.status && SUCCESS_MESSAGES[query.status]
        ? <FeedbackBanner tone="success">{SUCCESS_MESSAGES[query.status]}</FeedbackBanner>
        : null}
      {error ? <FeedbackBanner tone={requiresMfa(error) ? "warning" : "error"}>
        {crmErrorMessage(error)}
        {requiresMfa(error) ? <>
          {" "}
          <Link className="underline underline-offset-4" href={mfaHref(detailPath)}>Verificar agora</Link>.
        </> : null}
      </FeedbackBanner> : null}
      {opportunities.status === "forbidden" && opportunitiesNote
        ? <FeedbackBanner tone="warning">{opportunitiesNote}</FeedbackBanner>
        : null}

      <ContactDetail
        actions={actions}
        activities={activities}
        contact={{
          archived: contact.archived_at !== null,
          createdAtLabel: formatClinicDateTime(contact.created_at, context.clinic.timezone),
          fullName: contact.full_name,
          id: contact.id,
          isPatient: result.patient !== null,
          methods,
          notes: contact.notes,
          ownerName,
          patientSinceLabel: result.patient?.became_patient_at
            ? formatClinicDateTime(result.patient.became_patient_at, context.clinic.timezone)
            : null,
          updatedAtLabel: formatClinicDateTime(contact.updated_at, context.clinic.timezone),
        }}
        defaultTabKey={query.tab}
        opportunities={opportunityRows}
        opportunitiesNote={opportunities.status === "ok" ? opportunitiesNote : undefined}
      />
    </div>
  </div>;
}
