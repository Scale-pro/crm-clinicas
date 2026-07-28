import { sumAmountCents } from "../_components/opportunity-view";

/**
 * Regras de leitura da visão geral do gestor. Tudo aqui é função pura sobre
 * dados já devolvidos pelos casos de uso do domínio: nenhum acesso a banco,
 * nenhum número inventado e nenhum valor de demonstração. Quando um cálculo
 * não pode ser feito com os dados disponíveis, o retorno é `null` — a
 * interface mostra "—" em vez de improvisar.
 */

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Oportunidade normalizada a partir do quadro (`listOpportunityBoard`). */
export type DashboardOpportunity = {
  readonly id: string;
  readonly title: string;
  readonly contactName: string;
  readonly assigneeId: string | null;
  readonly assigneeName: string;
  readonly sourceName: string | null;
  readonly stageId: string;
  readonly status: string;
  readonly amountCents: number | null;
  readonly closedAt: string | null;
  readonly updatedAt: string;
};

export type DashboardStage = {
  readonly id: string;
  readonly name: string;
  readonly stage_kind: string;
  readonly position: number;
};

export const PERIOD_OPTIONS = [
  { days: 7, key: "7d", label: "7 dias", longLabel: "Últimos 7 dias" },
  { days: 30, key: "30d", label: "30 dias", longLabel: "Últimos 30 dias" },
  { days: 90, key: "90d", label: "90 dias", longLabel: "Últimos 90 dias" },
] as const;

export type PeriodKey = (typeof PERIOD_OPTIONS)[number]["key"];
export type PeriodOption = (typeof PERIOD_OPTIONS)[number];

export const DEFAULT_PERIOD: PeriodKey = "30d";

/** Oportunidade aberta sem atualização há este número de dias é "parada". */
export const STALE_AFTER_DAYS = 7;

/** Fatia das oportunidades abertas a partir da qual uma etapa vira gargalo. */
export const STAGE_CONCENTRATION_THRESHOLD = 0.4;

/** Quantidade máxima de itens exibidos nas listas resumidas da visão geral. */
export const OVERVIEW_LIST_LIMIT = 8;

/** Valida o período recebido na query string; qualquer outro valor vira 30d. */
export function parsePeriod(value: unknown): PeriodKey {
  if (typeof value !== "string") return DEFAULT_PERIOD;
  const match = PERIOD_OPTIONS.find((option) => option.key === value);
  return match ? match.key : DEFAULT_PERIOD;
}

export function periodOption(key: PeriodKey): PeriodOption {
  return PERIOD_OPTIONS.find((option) => option.key === key) ?? PERIOD_OPTIONS[1];
}

/** Link canônico da visão geral com o período selecionado. */
export function dashboardHref(period: PeriodKey): string {
  return `/app?period=${period}`;
}

export type PeriodRange = { readonly start: Date; readonly end: Date };

/** Janela do período em UTC — o instante final é o momento da renderização. */
export function periodRange(key: PeriodKey, now: Date): PeriodRange {
  const option = periodOption(key);
  return {
    end: new Date(now.getTime()),
    start: new Date(now.getTime() - option.days * MILLISECONDS_PER_DAY),
  };
}

function parseInstant(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/** Dias inteiros decorridos desde `value`; `null` quando a data é inválida. */
export function daysSince(value: string, now: Date): number | null {
  const parsed = parseInstant(value);
  if (parsed === null) return null;
  return Math.max(0, Math.floor((now.getTime() - parsed) / MILLISECONDS_PER_DAY));
}

export function isStale(value: string, now: Date): boolean {
  const elapsed = daysSince(value, now);
  return elapsed !== null && elapsed >= STALE_AFTER_DAYS;
}

/** Oportunidades encerradas dentro da janela do período selecionado. */
export function closedWithinPeriod(
  opportunities: readonly DashboardOpportunity[],
  range: PeriodRange,
): DashboardOpportunity[] {
  return opportunities.filter((opportunity) => {
    const closed = parseInstant(opportunity.closedAt);
    return closed !== null && closed >= range.start.getTime() && closed <= range.end.getTime();
  });
}

/** ganhas / (ganhas + perdidas). `null` quando nada foi encerrado. */
export function conversionRate(won: number, lost: number): number | null {
  const closed = won + lost;
  if (closed <= 0) return null;
  return won / closed;
}

/** Valor médio por oportunidade ganha, em centavos. `null` sem ganhas. */
export function averageTicketCents(totalCents: number, wonCount: number): number | null {
  if (wonCount <= 0) return null;
  return Math.round(totalCents / wonCount);
}

export function countWithoutAmount(opportunities: readonly DashboardOpportunity[]): number {
  return opportunities.filter((opportunity) => opportunity.amountCents === null).length;
}

export type DashboardSummary = {
  readonly openCount: number;
  readonly openAmountCents: number;
  readonly openWithoutAmountCount: number;
  readonly staleCount: number;
  readonly wonCount: number;
  readonly wonAmountCents: number;
  readonly lostCount: number;
  readonly closedCount: number;
  readonly conversion: number | null;
  readonly averageWonTicketCents: number | null;
};

export function buildSummary(input: {
  readonly open: readonly DashboardOpportunity[];
  readonly closedInPeriod: readonly DashboardOpportunity[];
  readonly now: Date;
}): DashboardSummary {
  const won = input.closedInPeriod.filter((opportunity) => opportunity.status === "won");
  const lost = input.closedInPeriod.filter((opportunity) => opportunity.status === "lost");
  const wonAmountCents = sumAmountCents(won);
  return {
    averageWonTicketCents: averageTicketCents(wonAmountCents, won.length),
    closedCount: won.length + lost.length,
    conversion: conversionRate(won.length, lost.length),
    lostCount: lost.length,
    openAmountCents: sumAmountCents(input.open),
    openCount: input.open.length,
    openWithoutAmountCount: countWithoutAmount(input.open),
    staleCount: input.open.filter((opportunity) => isStale(opportunity.updatedAt, input.now)).length,
    wonAmountCents,
    wonCount: won.length,
  };
}

export type StageBreakdownRow = {
  readonly stageId: string;
  readonly name: string;
  readonly stageKind: string;
  readonly count: number;
  readonly amountCents: number;
  /** Fatia das oportunidades abertas carregadas, entre 0 e 1. */
  readonly share: number;
};

/**
 * Distribuição das oportunidades abertas por etapa, na ordem devolvida pelo
 * servidor. Etapas sem oportunidade continuam na lista com contagem zero.
 */
export function buildStageBreakdown(
  stages: readonly DashboardStage[],
  open: readonly DashboardOpportunity[],
): StageBreakdownRow[] {
  const total = open.length;
  return stages.map((stage) => {
    const stageOpportunities = open.filter((opportunity) => opportunity.stageId === stage.id);
    return {
      amountCents: sumAmountCents(stageOpportunities),
      count: stageOpportunities.length,
      name: stage.name,
      share: total > 0 ? stageOpportunities.length / total : 0,
      stageId: stage.id,
      stageKind: stage.stage_kind,
    };
  });
}

/**
 * Etapas que concentram uma fatia alta das oportunidades abertas. Só faz
 * sentido quando existe mais de uma etapa ocupada — com uma única etapa a
 * concentração seria trivialmente 100%.
 */
export function crowdedStages(
  rows: readonly StageBreakdownRow[],
  threshold = STAGE_CONCENTRATION_THRESHOLD,
): StageBreakdownRow[] {
  const occupied = rows.filter((row) => row.count > 0);
  if (occupied.length < 2) return [];
  return occupied
    .filter((row) => row.share >= threshold)
    .sort((left, right) => right.share - left.share || left.name.localeCompare(right.name, "pt-BR"));
}

export type AttentionReason = "unassigned" | "stale";

export type AttentionItem = {
  readonly id: string;
  readonly href: string;
  readonly title: string;
  readonly contactName: string;
  readonly assigneeName: string;
  readonly amountCents: number | null;
  readonly daysSinceUpdate: number;
  readonly hasOwner: boolean;
  readonly reasons: readonly AttentionReason[];
};

export function attentionReasons(
  opportunity: DashboardOpportunity,
  now: Date,
): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  if (!opportunity.assigneeId) reasons.push("unassigned");
  if (isStale(opportunity.updatedAt, now)) reasons.push("stale");
  return reasons;
}

/**
 * Fila de gargalos das oportunidades abertas: sem responsável primeiro, depois
 * maior tempo sem atualização e, por fim, maior valor comercial.
 */
export function buildAttentionItems(
  open: readonly DashboardOpportunity[],
  now: Date,
  limit = OVERVIEW_LIST_LIMIT,
): AttentionItem[] {
  return open
    .flatMap((opportunity) => {
      const reasons = attentionReasons(opportunity, now);
      if (reasons.length === 0) return [];
      return [{
        amountCents: opportunity.amountCents,
        assigneeName: opportunity.assigneeName,
        contactName: opportunity.contactName,
        daysSinceUpdate: daysSince(opportunity.updatedAt, now) ?? 0,
        hasOwner: Boolean(opportunity.assigneeId),
        href: `/app/opportunities/${opportunity.id}`,
        id: opportunity.id,
        reasons,
        title: opportunity.title,
      }];
    })
    .sort((left, right) =>
      Number(left.hasOwner) - Number(right.hasOwner)
      || right.daysSinceUpdate - left.daysSinceUpdate
      || (right.amountCents ?? 0) - (left.amountCents ?? 0)
      || left.id.localeCompare(right.id))
    .slice(0, limit);
}

export type PerformanceRow = {
  readonly key: string;
  readonly label: string;
  readonly openCount: number;
  readonly wonCount: number;
  readonly wonAmountCents: number;
  readonly lostCount: number;
  readonly conversion: number | null;
};

type PerformanceKey = { readonly key: string; readonly label: string };

function buildPerformance(
  identify: (opportunity: DashboardOpportunity) => PerformanceKey,
  open: readonly DashboardOpportunity[],
  closedInPeriod: readonly DashboardOpportunity[],
): PerformanceRow[] {
  const accumulator = new Map<string, {
    label: string;
    openCount: number;
    wonCount: number;
    wonAmountCents: number;
    lostCount: number;
  }>();

  function bucket(opportunity: DashboardOpportunity) {
    const identity = identify(opportunity);
    const current = accumulator.get(identity.key)
      ?? { label: identity.label, lostCount: 0, openCount: 0, wonAmountCents: 0, wonCount: 0 };
    accumulator.set(identity.key, current);
    return current;
  }

  for (const opportunity of open) bucket(opportunity).openCount += 1;
  for (const opportunity of closedInPeriod) {
    const current = bucket(opportunity);
    if (opportunity.status === "won") {
      current.wonCount += 1;
      current.wonAmountCents += opportunity.amountCents ?? 0;
    }
    if (opportunity.status === "lost") current.lostCount += 1;
  }

  return [...accumulator.entries()]
    .map(([key, value]) => ({
      conversion: conversionRate(value.wonCount, value.lostCount),
      key,
      label: value.label,
      lostCount: value.lostCount,
      openCount: value.openCount,
      wonAmountCents: value.wonAmountCents,
      wonCount: value.wonCount,
    }))
    .sort((left, right) =>
      right.wonAmountCents - left.wonAmountCents
      || right.wonCount - left.wonCount
      || right.openCount - left.openCount
      || left.label.localeCompare(right.label, "pt-BR"));
}

export const UNASSIGNED_OWNER_KEY = "sem-responsavel";
export const UNKNOWN_SOURCE_KEY = "sem-origem";
export const UNKNOWN_SOURCE_LABEL = "Sem origem informada";

/**
 * Desempenho por responsável. O nome vem do próprio caso de uso do quadro
 * (`assigneeName`), nunca de um identificador técnico.
 */
export function buildOwnerPerformance(
  open: readonly DashboardOpportunity[],
  closedInPeriod: readonly DashboardOpportunity[],
): PerformanceRow[] {
  return buildPerformance(
    (opportunity) => opportunity.assigneeId
      ? { key: opportunity.assigneeId, label: opportunity.assigneeName }
      : { key: UNASSIGNED_OWNER_KEY, label: opportunity.assigneeName },
    open,
    closedInPeriod,
  );
}

export function buildSourcePerformance(
  open: readonly DashboardOpportunity[],
  closedInPeriod: readonly DashboardOpportunity[],
): PerformanceRow[] {
  return buildPerformance(
    (opportunity) => opportunity.sourceName
      ? { key: opportunity.sourceName, label: opportunity.sourceName }
      : { key: UNKNOWN_SOURCE_KEY, label: UNKNOWN_SOURCE_LABEL },
    open,
    closedInPeriod,
  );
}

/** Oportunidades atualizadas mais recentemente, do conjunto já carregado. */
export function buildRecent(
  opportunities: readonly DashboardOpportunity[],
  limit = OVERVIEW_LIST_LIMIT,
): DashboardOpportunity[] {
  return [...opportunities]
    .sort((left, right) => {
      const leftUpdated = parseInstant(left.updatedAt) ?? 0;
      const rightUpdated = parseInstant(right.updatedAt) ?? 0;
      return rightUpdated - leftUpdated || left.id.localeCompare(right.id);
    })
    .slice(0, limit);
}

/** Rótulo humano do tempo sem atualização, sem depender de Intl. */
export function staleLabel(days: number): string {
  if (days <= 0) return "atualizada hoje";
  if (days === 1) return "sem atualização há 1 dia";
  return `sem atualização há ${days} dias`;
}
