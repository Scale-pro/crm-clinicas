"use client";

import { Check, Copy, UserPlus } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/shared/ui/button";
import { FeedbackBanner } from "@/shared/ui/feedback-banner";
import { FormField, formSelectClassName } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { SubmitButton } from "@/shared/ui/submit-button";

import { INVITE_IDLE, type InviteState } from "./invite-state";
import { INVITABLE_ROLES } from "./team-view-models";

/**
 * Convite de um novo membro.
 *
 * O único fluxo de escrita de equipe com contrato público na main. O cargo
 * `owner` não aparece na lista porque o contrato o recusa — oferecer a opção
 * seria oferecer uma ação que falharia, e abriria a porta para autoelevação de
 * privilégio na interface.
 *
 * **O sistema não envia e-mail.** O contrato cria o convite e devolve um link
 * com o token de aceite; sem repassar esse link, ninguém entra. Por isso o
 * painel mostra o link no resultado imediato da criação, com aviso explícito de
 * que o envio é manual. O link nunca vai para a URL: ele chega pelo estado da
 * ação e desaparece na próxima navegação.
 *
 * A clínica não é um campo deste formulário: a Server Action resolve o tenant
 * no servidor.
 */
export function InviteMemberPanel({ canInvite, action, initialState = INVITE_IDLE }: {
  canInvite: boolean;
  action: (previous: InviteState, formData: FormData) => Promise<InviteState>;
  /** Estado inicial do formulário. Em produção é sempre `idle`. */
  initialState?: InviteState;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [copied, setCopied] = useState(false);

  if (!canInvite) {
    return <p className="rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm text-muted-foreground" role="status">
      Convidar pessoas exige a permissão de convite de membros. Fale com um responsável da clínica.
    </p>;
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Sem permissão de área de transferência o link continua selecionável no
      // texto abaixo — o fluxo não depende do botão.
      setCopied(false);
    }
  }

  return <section aria-labelledby="invite-title" className="space-y-3 rounded-lg border border-border bg-surface p-3">
    <div>
      <h2 className="text-sm font-semibold" id="invite-title">Convidar membro</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        O convite é criado no servidor, vinculado à clínica ativa e exige verificação em duas etapas.
      </p>
    </div>

    {state.status === "error"
      ? <FeedbackBanner tone="error">{state.message}</FeedbackBanner>
      : null}

    {state.status === "created" ? <div className="space-y-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm text-warning-strong" role="status">
      <p>
        Convite criado para <strong className="font-semibold">{state.email}</strong>. Copie o link
        abaixo e envie para a pessoa por um canal seguro. O sistema ainda não envia esse convite
        automaticamente por e-mail.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 select-all break-all rounded border border-border bg-surface px-2 py-1 text-xs text-foreground">
          {state.link}
        </code>
        <Button onClick={() => void copyLink(state.link)} size="sm" type="button" variant="outline">
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Link copiado" : "Copiar link"}
        </Button>
      </div>
      <p className="text-xs">
        O link vale por {state.expiresInHours} horas e dá acesso a esta clínica: compartilhe somente
        com a pessoa convidada. Ele aparece uma única vez — ao sair desta tela, não é possível
        recuperá-lo.
      </p>
    </div> : null}

    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <FormField className="min-w-56 flex-1" id="invite-email" label="E-mail" required>
        <Input
          autoComplete="off"
          id="invite-email"
          inputMode="email"
          maxLength={320}
          name="email"
          required
          type="email"
        />
      </FormField>
      <FormField className="min-w-40" id="invite-role" label="Cargo" required>
        <select className={formSelectClassName} defaultValue="viewer" id="invite-role" name="role" required>
          {INVITABLE_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
        </select>
      </FormField>
      <SubmitButton pendingLabel="Criando…" size="sm">
        <UserPlus aria-hidden="true" />
        Criar convite
      </SubmitButton>
    </form>
    <p className="text-xs text-muted-foreground">
      O cargo de proprietário não pode ser concedido por convite.
    </p>
  </section>;
}
