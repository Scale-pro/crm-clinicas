import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveActiveClinicContext } from "@/modules/tenancy";
import { listWhatsAppAccounts } from "@/modules/whatsapp";
import { requirePermission } from "@/shared/auth";
import { serverEnv } from "@/shared/config";
import { AccessDeniedState } from "@/shared/ui/access-denied-state";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";
import { PageToolbar } from "@/shared/ui/page-toolbar";

import { WhatsAppAccountScreen } from "./whatsapp-account-screen";

/**
 * Sem uma instância cadastrada aqui, nada dispara: `ingest_whatsapp_event`
 * resolve o tenant pela conta do provedor e recusa evento de conta
 * desconhecida. É esta tela que liga a funcionalidade para a clínica.
 */
export default async function WhatsAppSettingsPage() {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") redirect("/app");
  const manageAccess = await requirePermission(context.clinic.id, "clinic.manage");

  const toolbar = <PageToolbar
    actions={<Button asChild size="sm" variant="outline">
      <Link href="/app/settings"><ArrowLeft aria-hidden="true" />Configurações</Link>
    </Button>}
    description="Instância do provedor que recebe e envia as mensagens da clínica."
    title="WhatsApp"
  />;

  if (!manageAccess.allowed) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        <AccessDeniedState
          action={<Button asChild size="sm" variant="outline">
            <Link href="/app/settings">Voltar às configurações</Link>
          </Button>}
          description="Conectar o WhatsApp exige a permissão de gestão da clínica. Fale com um responsável."
        />
      </div>
    </div>;
  }

  const accounts = await listWhatsAppAccounts(context.clinic.id);
  if (!accounts.ok) {
    return <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="p-4 sm:p-5">
        <ErrorState
          description="Tente novamente em alguns instantes."
          title="Não foi possível carregar as instâncias"
        />
      </div>
    </div>;
  }

  // O segredo do webhook não é exibido: quem configura o provedor recebe o
  // endereço, e o segredo vem do ambiente do servidor (ADR-012).
  const webhookUrl = new URL("/api/whatsapp/uazapi/webhook", serverEnv.APP_URL).toString();

  return <div className="flex min-h-0 flex-1 flex-col">
    {toolbar}
    <div className="scroll-slim mx-auto w-full max-w-3xl min-h-0 flex-1 overflow-auto p-4 sm:p-5">
      <WhatsAppAccountScreen
        accounts={accounts.accounts.map((account) => ({
          displayPhoneE164: account.display_phone_e164,
          externalAccountId: account.external_account_id,
          id: account.id,
          provider: account.provider,
          status: account.status,
        }))}
        webhookUrl={webhookUrl}
      />
    </div>
  </div>;
}
