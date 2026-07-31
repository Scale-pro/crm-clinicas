import Link from "next/link";

import { Button } from "@/shared/ui/button";
import { FilterPopover } from "@/shared/ui/filter-popover";
import { formSelectClassName } from "@/shared/ui/form-field";
import { SearchField } from "@/shared/ui/search-field";

export type ContactOwnerOption = { readonly userId: string; readonly fullName: string };

/**
 * Busca e filtros da listagem de contatos.
 *
 * `form method="get"` que apenas reescreve a query string — quem filtra de
 * verdade é o servidor, pelo contrato `listContacts`. Só são oferecidos os
 * filtros que esse contrato aceita: termo de busca, responsável e inclusão de
 * arquivados. Um seletor que a listagem ignorasse pareceria funcionar sem
 * funcionar.
 *
 * A busca aceita nome parcial ou telefone/e-mail exato — é o que
 * `search_contacts` faz, e o texto de ajuda diz isso.
 */
export function ContactFilterBar({
  basePath,
  search,
  ownerUserId,
  includeArchived,
  limit,
  limitOptions,
  owners,
  canIncludeArchived,
}: {
  basePath: string;
  search: string;
  ownerUserId: string;
  includeArchived: boolean;
  /** Quantidade pedida ao contrato — substitui a paginação, que ele não oferece. */
  limit: number;
  limitOptions: readonly number[];
  owners: readonly ContactOwnerOption[];
  /** `contact.archive` resolvida no servidor; sem ela o filtro não é oferecido. */
  canIncludeArchived: boolean;
}) {
  const activeCount = [ownerUserId, includeArchived ? "1" : ""].filter((value) => value !== "").length;

  return <form action={basePath} className="flex flex-wrap items-center gap-2" method="get">
    <SearchField
      defaultValue={search}
      id="contacts-q"
      label="Buscar contato"
      placeholder="Nome, telefone ou e-mail exato"
    />
    <FilterPopover
      activeCount={activeCount}
      footer={<>
        <Button asChild size="sm" variant="ghost"><Link href={basePath}>Limpar filtros</Link></Button>
        <Button size="sm" type="submit">Aplicar filtros</Button>
      </>}
    >
      <label className="grid gap-1 text-xs font-medium" htmlFor="contacts-owner">
        Responsável
        <select className={formSelectClassName} defaultValue={ownerUserId} id="contacts-owner" name="owner">
          <option value="">Todos permitidos</option>
          {owners.map((owner) => <option key={owner.userId} value={owner.userId}>{owner.fullName}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium" htmlFor="contacts-limit">
        Quantidade exibida
        <select className={formSelectClassName} defaultValue={String(limit)} id="contacts-limit" name="limit">
          {limitOptions.map((option) => <option key={option} value={option}>{option} contatos</option>)}
        </select>
      </label>
      {canIncludeArchived ? <label className="flex items-center gap-2 text-xs font-medium" htmlFor="contacts-archived">
        <input
          className="size-4 shrink-0 accent-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          defaultChecked={includeArchived}
          id="contacts-archived"
          name="archived"
          type="checkbox"
          value="1"
        />
        Incluir contatos arquivados
      </label> : null}
    </FilterPopover>
    {activeCount > 0 || search
      ? <p className="text-xs text-muted-foreground" role="status">
        {activeCount} filtro(s) além da pesquisa.{" "}
        <Link className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href={basePath}>
          Limpar tudo
        </Link>
      </p>
      : null}
  </form>;
}
