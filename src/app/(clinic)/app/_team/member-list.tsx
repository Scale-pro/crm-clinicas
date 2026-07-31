import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { LoadingTable } from "@/shared/ui/loading-table";
import { StatusBadge } from "@/shared/ui/status-badge";

import {
  memberInitials,
  roleLabel,
  roleTone,
  type MemberRowView,
} from "./team-view-models";

export type MemberListState = "ready" | "loading" | "error";

/**
 * Lista de membros ativos da clínica.
 *
 * Componente puro: recebe as linhas já carregadas e paginadas pelo servidor.
 *
 * As colunas exibidas são exatamente as que `listActiveClinicMembers` informa —
 * nome, cargo e situação. E-mail, data de entrada, último acesso, profissional
 * vinculado e permissões efetivas não têm contrato público e por isso não
 * aparecem: uma coluna vazia em toda linha seria ruído, e uma coluna preenchida
 * por adivinhação seria mentira.
 */
export function MemberList({
  rows,
  state = "ready",
  hasFilters = false,
  totalLabel,
}: {
  rows: readonly MemberRowView[];
  state?: MemberListState;
  hasFilters?: boolean;
  totalLabel?: string;
}) {
  if (state === "loading") return <LoadingTable columns={3} label="Carregando equipe…" />;

  if (state === "error") {
    return <ErrorState
      description="Não conseguimos carregar a equipe agora. Tente novamente em alguns instantes."
      title="Não foi possível carregar a equipe"
    />;
  }

  if (rows.length === 0) {
    return hasFilters
      ? <EmptyState
        description="Ajuste a pesquisa para encontrar outra pessoa da equipe."
        title="Nenhum membro para esta busca"
      />
      : <EmptyState
        description="Convide a primeira pessoa para trabalhar nesta clínica."
        title="Nenhum membro ativo"
      />;
  }

  return <div className="space-y-3">
    {totalLabel ? <p className="text-xs text-muted-foreground" role="status">{totalLabel}</p> : null}
    <ul aria-label="Membros ativos da clínica" className="divide-y divide-border rounded-lg border border-border bg-surface">
      {rows.map((member) => <li className="flex flex-wrap items-center gap-3 px-3 py-2.5" key={member.userId}>
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
        >
          {memberInitials(member.fullName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-medium">{member.fullName}</span>
            {member.isCurrentUser ? <StatusBadge>Você</StatusBadge> : null}
          </span>
        </span>
        <StatusBadge tone={roleTone(member.role)}>{roleLabel(member.role)}</StatusBadge>
        <StatusBadge tone="success">Ativo</StatusBadge>
      </li>)}
    </ul>
    <p className="text-xs text-muted-foreground">
      Esta lista traz somente membros ativos: o contrato de leitura não devolve convites pendentes
      nem membros desativados.
    </p>
  </div>;
}
