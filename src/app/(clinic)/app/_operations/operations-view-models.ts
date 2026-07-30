import { matchesTerm } from "@/shared/lib/text";
import type { StatusTone } from "@/shared/ui/status-badge";

import type { WeeklyAvailabilityDraft } from "./operations-validation";

/**
 * Modelos de apresentação da fundação de operações da clínica.
 *
 * São **view models**: descrevem o que a interface precisa desenhar, não o
 * formato definitivo das tabelas. Enquanto o backend correspondente não estiver
 * integrado, nenhum destes tipos é preenchido em produção — os componentes os
 * recebem por props e as páginas declaram o estado real de indisponibilidade.
 * Quando as RPCs existirem, o mapeamento acontece na fronteira (página/loader),
 * sem mudar os componentes.
 */

export type OperationsStatus = "active" | "inactive";

/**
 * Estado da listagem. `unavailable` é o estado honesto enquanto o contrato de
 * backend não existe: não é vazio (não sabemos se há dados) nem erro.
 */
export type OperationsListState = "ready" | "loading" | "error" | "unavailable";

// ---------------------------------------------------------------------------
// Cor de agenda
// ---------------------------------------------------------------------------

export type AgendaColor = {
  readonly token: string;
  readonly label: string;
  readonly cssValue: string;
};

/**
 * Paleta fechada das cores de agenda, reaproveitando os tokens de etapa do
 * design system. O valor guardado é o token — nunca um valor de cor cru — para
 * que o tema continue mandando na aparência final.
 */
export const AGENDA_COLORS: readonly AgendaColor[] = [
  { cssValue: "var(--stage-1)", label: "Azul", token: "azul" },
  { cssValue: "var(--stage-2)", label: "Azul-claro", token: "azul-claro" },
  { cssValue: "var(--stage-3)", label: "Turquesa", token: "turquesa" },
  { cssValue: "var(--stage-4)", label: "Verde", token: "verde" },
  { cssValue: "var(--stage-5)", label: "Âmbar", token: "ambar" },
  { cssValue: "var(--stage-6)", label: "Laranja", token: "laranja" },
  { cssValue: "var(--stage-7)", label: "Violeta", token: "violeta" },
];

export const DEFAULT_AGENDA_COLOR_TOKEN = AGENDA_COLORS[0]!.token;

/** Token desconhecido cai na primeira cor da paleta — nunca em cor inventada. */
export function agendaColor(token: string): AgendaColor {
  return AGENDA_COLORS.find((color) => color.token === token) ?? AGENDA_COLORS[0]!;
}

// ---------------------------------------------------------------------------
// Profissionais
// ---------------------------------------------------------------------------

export type ProfessionalSummaryView = {
  readonly id: string;
  readonly displayName: string;
  readonly specialties: readonly string[];
  /** Token da paleta de agenda (ver `AGENDA_COLORS`). */
  readonly colorToken: string;
  readonly status: OperationsStatus;
  /**
   * Nome do usuário da equipe vinculado, `null` para profissional sem conta e
   * **ausente** quando a origem dos dados não informa o vínculo. Ausente é
   * diferente de `null`: a interface mostra "—" em vez de afirmar que não há
   * conta vinculada.
   */
  readonly linkedUserName?: string | null;
  /** Resumo já formatado dos dias atendidos (ex.: "Seg, Ter, Qua"). */
  readonly weekdaysLabel?: string;
  /** Resumo já formatado da carga semanal (ex.: "5 dias • 40h por semana"). */
  readonly availabilityLabel?: string;
  readonly enabledProcedureCount?: number;
  /** Rota de detalhe. Nunca expomos o identificador cru na interface. */
  readonly href: string;
};

/**
 * No detalhe todos os dados estão resolvidos — por isso os campos que a
 * listagem pode não conhecer voltam a ser obrigatórios aqui.
 */
export type ProfessionalDetailView = ProfessionalSummaryView & {
  readonly linkedUserName: string | null;
  readonly weekdaysLabel: string;
  readonly availabilityLabel: string;
  readonly enabledProcedureCount: number;
  readonly email: string | null;
  readonly phoneLabel: string | null;
  readonly registrationType: string | null;
  readonly registrationNumber: string | null;
  readonly notes: string | null;
  readonly availability: WeeklyAvailabilityDraft;
};

/** Procedimento habilitado para um profissional, já com os valores efetivos. */
export type ProfessionalProcedureView = {
  readonly procedureId: string;
  readonly name: string;
  readonly category: string | null;
  readonly baseDurationMinutes: number;
  readonly basePriceCents: number;
  readonly durationOverrideMinutes: number | null;
  readonly priceOverrideCents: number | null;
};

// ---------------------------------------------------------------------------
// Procedimentos
// ---------------------------------------------------------------------------

export type ProcedureSummaryView = {
  readonly id: string;
  readonly name: string;
  readonly category: string | null;
  readonly durationMinutes: number;
  readonly basePriceCents: number;
  readonly colorToken: string;
  readonly status: OperationsStatus;
  /** Ausente quando a origem dos dados não conta vínculos — a interface mostra "—". */
  readonly enabledProfessionalCount?: number;
  readonly href: string;
};

export type ProcedureDetailView = ProcedureSummaryView & {
  readonly enabledProfessionalCount: number;
  readonly description: string | null;
};

/** Vínculo profissional ↔ procedimento visto a partir do procedimento. */
export type ProcedureProfessionalLinkView = {
  readonly professionalId: string;
  readonly displayName: string;
  readonly specialties: readonly string[];
  readonly colorToken: string;
  readonly enabled: boolean;
  readonly durationOverrideMinutes: number | null;
  readonly priceOverrideCents: number | null;
};

// ---------------------------------------------------------------------------
// Rótulos e tons
// ---------------------------------------------------------------------------

/** Marca de "não carregado nesta origem" — nunca de "não existe". */
export const UNKNOWN_FIELD_LABEL = "—";

/**
 * `undefined` (o dado não veio) vira "—"; `null` (o dado veio e está vazio) usa
 * o texto explícito. A distinção evita afirmar ausência sem ter perguntado.
 */
export function optionalText(value: string | null | undefined, whenEmpty: string): string {
  if (value === undefined) return UNKNOWN_FIELD_LABEL;
  return value ?? whenEmpty;
}

export function optionalCount(value: number | undefined): string {
  return value === undefined ? UNKNOWN_FIELD_LABEL : String(value);
}

export function statusLabel(status: OperationsStatus): string {
  return status === "active" ? "Ativo" : "Inativo";
}

export function statusTone(status: OperationsStatus): StatusTone {
  return status === "active" ? "success" : "neutral";
}

// ---------------------------------------------------------------------------
// Valores efetivos (herança do padrão × personalização por profissional)
// ---------------------------------------------------------------------------

/**
 * Duração que vale para o par profissional × procedimento. Sem personalização,
 * herda a duração padrão do procedimento.
 */
export function effectiveDurationMinutes(
  baseMinutes: number,
  overrideMinutes: number | null,
): number {
  return overrideMinutes ?? baseMinutes;
}

/** Preço efetivo em centavos. `0` é um valor legítimo de personalização. */
export function effectivePriceCents(
  basePriceCents: number,
  overridePriceCents: number | null,
): number {
  return overridePriceCents ?? basePriceCents;
}

export function hasDurationOverride(link: {
  readonly durationOverrideMinutes: number | null;
}): boolean {
  return link.durationOverrideMinutes !== null;
}

export function hasPriceOverride(link: {
  readonly priceOverrideCents: number | null;
}): boolean {
  return link.priceOverrideCents !== null;
}

export function hasAnyOverride(link: {
  readonly durationOverrideMinutes: number | null;
  readonly priceOverrideCents: number | null;
}): boolean {
  return hasDurationOverride(link) || hasPriceOverride(link);
}

export function countEnabledLinks(
  links: readonly { readonly enabled: boolean }[],
): number {
  return links.filter((link) => link.enabled).length;
}

// ---------------------------------------------------------------------------
// Filtros (puros — a listagem recebe as linhas já filtradas)
// ---------------------------------------------------------------------------

export type StatusFilter = OperationsStatus | "all";

export type ProfessionalFilters = {
  readonly search: string;
  readonly status: StatusFilter;
  /** Especialidade exata da lista de opções; string vazia = todas. */
  readonly specialty: string;
};

export type ProcedureFilters = {
  readonly search: string;
  readonly status: StatusFilter;
  /** Categoria exata da lista de opções; string vazia = todas. */
  readonly category: string;
};

export function filterProfessionals(
  rows: readonly ProfessionalSummaryView[],
  filters: ProfessionalFilters,
): readonly ProfessionalSummaryView[] {
  return rows.filter((row) => {
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.specialty !== "" && !row.specialties.includes(filters.specialty)) return false;
    return matchesTerm(filters.search, [
      row.displayName,
      row.linkedUserName ?? null,
      ...row.specialties,
    ]);
  });
}

export function filterProcedures(
  rows: readonly ProcedureSummaryView[],
  filters: ProcedureFilters,
): readonly ProcedureSummaryView[] {
  return rows.filter((row) => {
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.category !== "" && row.category !== filters.category) return false;
    return matchesTerm(filters.search, [row.name, row.category]);
  });
}

/** Especialidades distintas presentes nas linhas, em ordem alfabética pt-BR. */
export function collectSpecialties(
  rows: readonly ProfessionalSummaryView[],
): readonly string[] {
  const unique = new Set(rows.flatMap((row) => row.specialties));
  return [...unique].sort((left, right) => left.localeCompare(right, "pt-BR"));
}

/** Categorias distintas presentes nas linhas, em ordem alfabética pt-BR. */
export function collectCategories(
  rows: readonly ProcedureSummaryView[],
): readonly string[] {
  const unique = new Set(
    rows.map((row) => row.category).filter((category): category is string => category !== null),
  );
  return [...unique].sort((left, right) => left.localeCompare(right, "pt-BR"));
}

/** Quantidade de filtros ativos além da pesquisa — alimenta o contador visual. */
export function activeFilterCount(filters: {
  readonly status: StatusFilter;
  readonly specialty?: string;
  readonly category?: string;
}): number {
  return [
    filters.status === "all" ? "" : filters.status,
    filters.specialty ?? "",
    filters.category ?? "",
  ].filter((value) => value !== "").length;
}
