import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listActiveClinicMembers, resolveActiveClinicContext } from "@/modules/tenancy";
import { requirePermission, requireSession } from "@/shared/auth";
import { AccessDeniedState } from "@/shared/ui/access-denied-state";
import { Button } from "@/shared/ui/button";
import { FeedbackBanner } from "@/shared/ui/feedback-banner";
import { PageToolbar } from "@/shared/ui/page-toolbar";
import { SearchField } from "@/shared/ui/search-field";

import { crmErrorMessage, mfaHref, requiresMfa } from "../../_crm/crm-errors";
import { inviteMemberAction } from "../../_team/actions";
import { InviteMemberPanel } from "../../_team/invite-member-panel";
import { MemberList } from "../../_team/member-list";
import { ownerCount, type MemberRowView } from "../../_team/team-view-models";

/**
 * Equipe da clínica.
 *
 * Tenant resolvido no servidor; a leitura usa `listActiveClinicMembers`, que
 * exige acesso à clínica e já pagina no servidor.
 *
 * **O que existe de escrita:** apenas o convite (`inviteClinicMember`, com
 * AAL2). Alterar cargo, ativar, desativar, remover membro, reenviar e cancelar
 * convite têm permissão no catálogo (`member.manage`, `member.remove`) mas
 * **não** têm função exportada por `@/modules/tenancy` — então esta tela é de
 * leitura nesses pontos, sem botão morto.
 */

const TEAM_PATH = "/app/settings/team";
const PAGE_SIZE = 25;

const SUCCESS_MESSAGES: Readonly<Record<string, string>> = {
  member_invited: "Convite enviado. A pessoa recebe o acesso ao aceitar.",
};

function stringParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function pageParam(value: string | string[] | undefined): number {
  const parsed = Number(stringParam(value));
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1_000_000 ? parsed : 1;
}

function href(search: string, page: number): string {
  const query = new URLSearchParams();
  if (search) query.set("q", search);
  if (page > 1) query.set("page", String(page));
  const serialized = query.toString();
  return serialized ? `${TEAM_PATH}?${serialized}` : TEAM_PATH;
}

export default async function TeamSettingsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [context, params] = await Promise.all([resolveActiveClinicContext(), searchParams]);
  if (context.status !== "ready") redirect("/app");
  const clinicId = context.clinic.id;

  const search = stringParam(params.q);
  const page = pageParam(params.page);
  const status = stringParam(params.status);
  const error = stringParam(params.error);

  const [result, invitePermission, session] = await Promise.all([
    listActiveClinicMembers({ clinicId, page, pageSize: PAGE_SIZE, search }),
    requirePermission(clinicId, "member.invite"),
    requireSession(),
  ]);
  const currentUserId = session.allowed ? session.session.userId : null;

  const toolbar = <PageToolbar
    actions={<Button asChild size="sm" variant="outline">
      <Link href="/app/settings"><ArrowLeft aria-hidden="true" />Configurações</Link>
    </Button>}
    description="Quem tem acesso a esta clínica e com qual cargo."
    title="Equipe"
  />;

  if (!result.ok && (result.code === "forbidden" || result.code === "unauthenticated")) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        <AccessDeniedState
          action={<Button asChild size="sm" variant="outline"><Link href="/app/settings">Voltar às configurações</Link></Button>}
          description="Ver a equipe exige acesso à clínica. Fale com um responsável."
        />
      </div>
    </div>;
  }

  const rows: readonly MemberRowView[] = result.ok
    ? result.items.map((member) => ({
      fullName: member.fullName,
      isCurrentUser: member.userId === currentUserId,
      role: member.role,
      userId: member.userId,
    }))
    : [];

  const owners = ownerCount(rows);
  const lastPage = result.ok ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  return <div className="flex min-h-0 flex-1 flex-col">
    {toolbar}
    <div className="scroll-slim min-h-0 flex-1 space-y-3 overflow-auto p-4 sm:p-5">
      <form action={TEAM_PATH} className="flex flex-wrap items-center gap-2" method="get">
        <SearchField defaultValue={search} id="team-q" label="Buscar membro" placeholder="Nome do membro" />
      </form>

      {status && SUCCESS_MESSAGES[status]
        ? <FeedbackBanner tone="success">{SUCCESS_MESSAGES[status]}</FeedbackBanner>
        : null}
      {error ? <FeedbackBanner tone={requiresMfa(error) ? "warning" : "error"}>
        {crmErrorMessage(error)}
        {requiresMfa(error) ? <>
          {" "}
          <Link className="underline underline-offset-4" href={mfaHref(TEAM_PATH)}>Verificar agora</Link>.
        </> : null}
      </FeedbackBanner> : null}

      {/* Falha de leitura nunca vira "nenhum membro ativo". */}
      <MemberList
        hasFilters={search !== ""}
        rows={rows}
        state={result.ok ? "ready" : "error"}
        totalLabel={result.ok ? `${result.total} membro(s) ativo(s) · página ${page} de ${lastPage}` : undefined}
      />

      {result.ok && lastPage > 1 ? <nav
        aria-label="Paginação da equipe"
        className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"
      >
        {page > 1
          ? <Button asChild size="sm" variant="outline"><Link href={href(search, page - 1)}>Anterior</Link></Button>
          : <Button disabled size="sm" variant="outline">Anterior</Button>}
        <p className="text-xs text-muted-foreground" role="status">Página {page} de {lastPage}</p>
        {result.hasMore
          ? <Button asChild size="sm" variant="outline"><Link href={href(search, page + 1)}>Próxima</Link></Button>
          : <Button disabled size="sm" variant="outline">Próxima</Button>}
      </nav> : null}

      {owners > 0 ? <p className="text-xs text-muted-foreground">
        {owners === 1
          ? "Esta clínica tem um único proprietário. O servidor impede que ele seja removido ou rebaixado enquanto for o último."
          : `Esta clínica tem ${owners} proprietários.`}
      </p> : null}

      <InviteMemberPanel action={inviteMemberAction} canInvite={invitePermission.allowed} />

      <p className="text-xs text-muted-foreground">
        Alterar cargo, desativar e remover membro ainda não têm contrato público nesta versão. Quando
        existirem, as ações aparecem aqui — a tela não oferece botão que não grave.
      </p>
    </div>
  </div>;
}
