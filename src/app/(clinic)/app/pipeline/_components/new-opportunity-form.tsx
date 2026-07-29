import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { SubmitButton } from "@/shared/ui/submit-button";

import { createOpportunityFormAction } from "../actions";

type ContactOption = { readonly id: string; readonly full_name: string };
type SourceOption = { readonly id: string; readonly name: string };

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Conteúdo do painel "Nova oportunidade". Reaproveita integralmente a Server
 * Action existente, a pesquisa de contatos server-side, a `idempotencyKey` e a
 * confirmação explícita de oportunidade aberta duplicada.
 */
export function NewOpportunityForm({
  clinicId,
  contactOptions,
  contactQuery,
  duplicateWarning,
  idempotencyKey,
  preservedFilters,
  selectedContactId,
  sourceOptions,
}: {
  clinicId: string;
  contactOptions: readonly ContactOption[];
  contactQuery: string;
  duplicateWarning: boolean;
  idempotencyKey: string;
  preservedFilters: Readonly<Record<string, string>>;
  selectedContactId: string;
  sourceOptions: readonly SourceOption[];
}) {
  return <div className="space-y-4">
    {duplicateWarning ? <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm" role="alert">
      <strong className="font-semibold">Já existe uma oportunidade aberta para este contato.</strong>{" "}
      Para criar outra, revise os dados e marque a confirmação explícita abaixo.
    </div> : null}

    <form action="/app/pipeline" className="space-y-2" method="get">
      {Object.entries(preservedFilters).map(([name, value]) => value
        ? <input key={name} name={name} type="hidden" value={value} />
        : null)}
      {selectedContactId ? <input name="contactId" type="hidden" value={selectedContactId} /> : null}
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="new" type="hidden" value="1" />
      <label className="block text-xs font-medium" htmlFor="contact-search">Buscar contato
        <Input className="mt-1" defaultValue={contactQuery} id="contact-search" maxLength={160} name="contactQ" placeholder="Nome, telefone ou e-mail" />
      </label>
      <Button size="sm" type="submit" variant="outline">Pesquisar contato</Button>
      <p className="text-xs text-muted-foreground">
        {contactQuery ? `Resultados para “${contactQuery}”.` : "Mostrando poucos contatos recentes; pesquise para localizar contatos antigos."}
      </p>
    </form>

    <form action={createOpportunityFormAction} className="space-y-3 border-t border-border pt-4">
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <label className="block text-xs font-medium" htmlFor="opportunity-contact">Contato
        <select className={`mt-1 ${selectClassName}`} defaultValue={selectedContactId} id="opportunity-contact" name="contactId" required>
          <option disabled value="">Selecione</option>
          {contactOptions.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name}</option>)}
        </select>
      </label>
      <label className="block text-xs font-medium" htmlFor="opportunity-title">Título
        <Input className="mt-1" id="opportunity-title" maxLength={160} minLength={2} name="title" required />
      </label>
      <label className="block text-xs font-medium" htmlFor="opportunity-amount">Valor em reais
        <Input className="mt-1" id="opportunity-amount" inputMode="decimal" name="amount" placeholder="0,00" />
      </label>
      <label className="block text-xs font-medium" htmlFor="opportunity-source">Origem
        <select className={`mt-1 ${selectClassName}`} id="opportunity-source" name="initialSourceId">
          <option value="">Sem origem</option>
          {sourceOptions.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
        </select>
      </label>
      <label className="flex items-start gap-2 text-xs">
        <input className="mt-0.5 size-4 shrink-0" name="confirmedExistingOpen" type="checkbox" />
        Confirmo que desejo criar outra oportunidade aberta se já existir uma para este contato.
      </label>
      <SubmitButton className="w-full" pendingLabel="Criando…">Criar oportunidade</SubmitButton>
    </form>
  </div>;
}
