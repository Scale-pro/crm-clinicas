"use client";

import { KeyRound, Plus } from "lucide-react";
import { useState } from "react";

import { formatBrPhoneDigits } from "@/shared/lib/phone";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { FeedbackBanner } from "@/shared/ui/feedback-banner";
import { Input } from "@/shared/ui/input";
import { StatusBadge } from "@/shared/ui/status-badge";

import {
  connectWhatsAppAccountAction,
  rotateWhatsAppTokenAction,
  type WhatsAppActionResult,
} from "../../_whatsapp/actions";
import { WHATSAPP_SETTINGS_PATH } from "../../_whatsapp/whatsapp-view";

export type WhatsAppAccountRow = {
  readonly displayPhoneE164: string | null;
  readonly externalAccountId: string;
  readonly id: string;
  readonly provider: string;
  readonly status: string;
};

type Notice = { readonly tone: "success" | "warning" | "error"; readonly text: string };

/**
 * Configuração da conta do provedor (decisão D4).
 *
 * O token é campo de escrita apenas: uma vez gravado ele é cifrado e não tem
 * caminho de volta para o navegador — nem para esta tela. Trocar de token é
 * digitar o novo, nunca "ver o atual".
 */
export function WhatsAppAccountScreen({ accounts, webhookUrl }: {
  accounts: readonly WhatsAppAccountRow[];
  webhookUrl: string | null;
}) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState(false);
  const [adding, setAdding] = useState(accounts.length === 0);

  async function run(action: () => Promise<WhatsAppActionResult>, successText: string) {
    setPending(true);
    setNotice(null);
    try {
      const result = await action();
      if (!result.ok) {
        setNotice({ text: result.message, tone: "error" });
        return result;
      }
      setNotice(result.warning
        ? { text: `${successText} ${result.warning}`, tone: "warning" }
        : { text: successText, tone: "success" });
      return result;
    } finally {
      setPending(false);
    }
  }

  async function connect(formData: FormData) {
    const result = await run(
      () => connectWhatsAppAccountAction({
        displayPhone: String(formData.get("displayPhone") ?? ""),
        externalAccountId: String(formData.get("externalAccountId") ?? ""),
        token: String(formData.get("token") ?? ""),
      }),
      "Instância conectada.",
    );
    if (result.ok) setAdding(false);
  }

  async function rotate(whatsappAccountId: string, formData: FormData) {
    await run(
      () => rotateWhatsAppTokenAction({
        token: String(formData.get("token") ?? ""),
        whatsappAccountId,
      }),
      "Token atualizado.",
    );
  }

  return <div className="space-y-4">
    {notice ? <FeedbackBanner tone={notice.tone}>
      {notice.text}
      {notice.text.includes("duas etapas") ? <>
        {" "}
        <a
          className="underline underline-offset-4"
          href={`/mfa?next=${encodeURIComponent(WHATSAPP_SETTINGS_PATH)}`}
        >
          Verificar agora
        </a>.
      </> : null}
    </FeedbackBanner> : null}

    {webhookUrl ? <section className="rounded-lg border border-border bg-surface p-4" aria-labelledby="webhook-title">
      <h2 className="text-sm font-semibold" id="webhook-title">Endereço do webhook</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Cadastre este endereço no painel da UAZAPI para que as mensagens cheguem ao CRM. O
        segredo que autentica a chamada é configurado no servidor e não aparece aqui.
      </p>
      <code className="mt-2 block overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">
        {webhookUrl}
      </code>
    </section> : null}

    <section aria-labelledby="accounts-title" className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold" id="accounts-title">Instâncias conectadas</h2>
          <p className="text-xs text-muted-foreground">
            Cada instância da UAZAPI atende um número de WhatsApp da clínica.
          </p>
        </div>
        <Button onClick={() => setAdding((value) => !value)} size="sm" type="button" variant="outline">
          <Plus aria-hidden="true" />
          Conectar instância
        </Button>
      </div>

      {accounts.length === 0 && !adding ? <div className="p-4">
        <EmptyState
          description="Conecte a instância da UAZAPI para começar a receber conversas no pipeline."
          title="Nenhuma instância conectada"
        />
      </div> : null}

      <ul className="divide-y divide-border">
        {accounts.map((account) => <li className="space-y-2 px-4 py-3" key={account.id}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {account.displayPhoneE164
                ? formatBrPhoneDigits(account.displayPhoneE164)
                : account.externalAccountId}
            </span>
            <StatusBadge tone={account.status === "active" ? "success" : "neutral"}>
              {account.status === "active" ? "Ativa" : "Desativada"}
            </StatusBadge>
            <StatusBadge>{account.provider}</StatusBadge>
          </div>
          <p className="text-xs text-muted-foreground">
            Instância: <span className="font-mono">{account.externalAccountId}</span>
          </p>

          <form
            action={(formData) => rotate(account.id, formData)}
            className="flex flex-wrap items-end gap-2"
          >
            <label
              className="min-w-48 flex-1 text-xs font-medium text-muted-foreground"
              htmlFor={`token-${account.id}`}
            >
              Novo token da instância
              <Input
                autoComplete="off"
                className="mt-1"
                id={`token-${account.id}`}
                maxLength={4096}
                minLength={8}
                name="token"
                required
                type="password"
              />
            </label>
            <Button disabled={pending} size="sm" type="submit" variant="outline">
              <KeyRound aria-hidden="true" />
              Salvar token
            </Button>
          </form>
        </li>)}
      </ul>

      {adding ? <form action={connect} className="space-y-3 border-t border-border bg-surface-subtle px-4 py-3">
        <label className="block text-xs font-medium text-muted-foreground" htmlFor="externalAccountId">
          Identificador da instância na UAZAPI
          <Input
            autoComplete="off"
            className="mt-1"
            id="externalAccountId"
            maxLength={200}
            name="externalAccountId"
            required
          />
        </label>
        <label className="block text-xs font-medium text-muted-foreground" htmlFor="displayPhone">
          Telefone exibido (opcional)
          <Input
            autoComplete="off"
            className="mt-1"
            id="displayPhone"
            maxLength={32}
            name="displayPhone"
            placeholder="(11) 90000-0000"
          />
        </label>
        <label className="block text-xs font-medium text-muted-foreground" htmlFor="token">
          Token da instância
          <Input
            autoComplete="off"
            className="mt-1"
            id="token"
            maxLength={4096}
            minLength={8}
            name="token"
            required
            type="password"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          O token é guardado cifrado e não volta a ser exibido.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={pending} size="sm" type="submit">Conectar instância</Button>
          {accounts.length > 0 ? <Button
            onClick={() => setAdding(false)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Cancelar
          </Button> : null}
        </div>
      </form> : null}
    </section>
  </div>;
}
