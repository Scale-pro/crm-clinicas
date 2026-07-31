import { UserPlus } from "lucide-react";

import { FormField, formSelectClassName } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { SubmitButton } from "@/shared/ui/submit-button";

import { INVITABLE_ROLES } from "./team-view-models";

/**
 * Convite de um novo membro.
 *
 * O único fluxo de escrita de equipe com contrato público na main. O cargo
 * `owner` não aparece na lista porque o contrato o recusa — oferecer a opção
 * seria oferecer uma ação que falharia, e abriria a porta para autoelevação de
 * privilégio na interface.
 *
 * A clínica não é um campo deste formulário: a Server Action resolve o tenant
 * no servidor. A ação chega por prop — o componente não conhece módulo, RPC nem
 * banco.
 */
export function InviteMemberPanel({ canInvite, action }: {
  canInvite: boolean;
  action: (formData: FormData) => void | Promise<void>;
}) {
  if (!canInvite) {
    return <p className="rounded-md border border-border bg-surface-subtle px-3 py-2 text-sm text-muted-foreground" role="status">
      Convidar pessoas exige a permissão de convite de membros. Fale com um responsável da clínica.
    </p>;
  }

  return <section aria-labelledby="invite-title" className="space-y-3 rounded-lg border border-border bg-surface p-3">
    <div>
      <h2 className="text-sm font-semibold" id="invite-title">Convidar membro</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        O convite vale por 72 horas e é validado no servidor, vinculado à clínica ativa e com
        verificação em duas etapas.
      </p>
    </div>
    <form action={action} className="flex flex-wrap items-end gap-2">
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
      <SubmitButton pendingLabel="Enviando…" size="sm">
        <UserPlus aria-hidden="true" />
        Enviar convite
      </SubmitButton>
    </form>
    <p className="text-xs text-muted-foreground">
      O cargo de proprietário não pode ser concedido por convite.
    </p>
  </section>;
}
