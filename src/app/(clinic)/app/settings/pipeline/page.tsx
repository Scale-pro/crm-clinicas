import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listOpportunityBoard } from "@/modules/crm";
import { resolveActiveClinicContext } from "@/modules/tenancy";
import { requirePermission } from "@/shared/auth";
import { AccessDeniedState } from "@/shared/ui/access-denied-state";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";
import { FeedbackBanner } from "@/shared/ui/feedback-banner";
import { PageToolbar } from "@/shared/ui/page-toolbar";

import { StageEditor } from "./stage-editor";

const successMessages: Readonly<Record<string, string>> = {
  stage_created: "Etapa criada.",
  stage_updated: "Etapa atualizada.",
  stages_reordered: "Ordem das etapas salva.",
};

export default async function PipelineSettingsPage({ searchParams }: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const [context, query] = await Promise.all([resolveActiveClinicContext(), searchParams]);
  if (context.status !== "ready") redirect("/app");
  const manageAccess = await requirePermission(context.clinic.id, "pipeline.manage");

  const toolbar = <PageToolbar
    actions={<Button asChild size="sm" variant="outline">
      <Link href="/app/settings"><ArrowLeft aria-hidden="true" />Configurações</Link>
    </Button>}
    description="Estrutura do pipeline padrão da clínica."
    title="Etapas do pipeline"
  />;

  if (!manageAccess.allowed) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        <AccessDeniedState
          action={<Button asChild size="sm" variant="outline"><Link href="/app/pipeline">Voltar ao pipeline</Link></Button>}
          description="A configuração de etapas exige a permissão de gestão do pipeline. Fale com um responsável da clínica."
        />
      </div>
    </div>;
  }

  const board = await listOpportunityBoard({ clinicId: context.clinic.id, page: 1, pageSize: 1, status: "open" });
  if (!board.ok) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        <ErrorState title="Não foi possível carregar as etapas" description="Tente novamente em alguns instantes." />
      </div>
    </div>;
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    {toolbar}
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-5">
      {query.status && successMessages[query.status]
        ? <FeedbackBanner tone="success">{successMessages[query.status]}</FeedbackBanner>
        : null}
      {query.error === "mfa_required"
        ? <FeedbackBanner tone="warning">Esta alteração exige verificação em duas etapas. <Link className="underline underline-offset-4" href="/mfa?next=%2Fapp%2Fsettings%2Fpipeline">Verificar agora</Link>.</FeedbackBanner>
        : null}
      {query.error && query.error !== "mfa_required"
        ? <FeedbackBanner tone="error">Não foi possível concluir a alteração. Revise os dados e tente novamente.</FeedbackBanner>
        : null}
      <p className="text-sm text-muted-foreground">
        O tipo da etapa (aberta, ganha ou perdida) é definido pelo sistema e não muda. Alterações exigem
        permissão de gestão do pipeline e verificação em duas etapas no servidor.
      </p>
      <StageEditor clinicId={context.clinic.id} stages={board.stages} />
    </div>
  </div>;
}
