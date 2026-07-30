import "server-only";

import { listOpportunityBoard } from "@/modules/crm";

import type { DashboardOpportunity, DashboardStage } from "./dashboard-view-model";

/**
 * Carregamento dos dados da visão geral. A dashboard só usa a interface
 * pública do módulo CRM (`listOpportunityBoard`), que é paginada: para que os
 * indicadores sejam totais de verdade, cada status é varrido até o fim dentro
 * de um teto de segurança. Se o teto for atingido antes do fim, o conjunto é
 * marcado como parcial e a interface avisa — nenhuma métrica global é
 * apresentada como completa a partir de uma página só.
 */

const PAGE_SIZE = 100;
/** Teto de páginas por status: 100 × 12 = 1.200 oportunidades por status. */
const MAX_PAGES = 12;
/** Páginas buscadas em paralelo por rodada, para evitar cascatas longas. */
const BATCH_SIZE = 4;

type BoardResult = Awaited<ReturnType<typeof listOpportunityBoard>>;
type BoardSuccess = Extract<BoardResult, { ok: true }>;
type BoardCard = BoardSuccess["cards"][number];

export type DashboardErrorCode = "forbidden" | "unavailable";

type BucketStatus = "open" | "won" | "lost";

type Bucket = {
  readonly cards: readonly BoardCard[];
  /** `false` quando o teto de páginas foi atingido e ainda havia dados. */
  readonly complete: boolean;
};

export type DashboardDataResult =
  | {
      readonly ok: true;
      readonly pipeline: BoardSuccess["pipeline"];
      readonly stages: readonly DashboardStage[];
      readonly scope: BoardSuccess["scope"];
      readonly open: readonly DashboardOpportunity[];
      readonly openComplete: boolean;
      readonly closed: readonly DashboardOpportunity[];
      readonly closedComplete: boolean;
      /** `false` quando não foi possível carregar o histórico de encerradas. */
      readonly closedAvailable: boolean;
    }
  | { readonly ok: false; readonly code: DashboardErrorCode };

function toOpportunity(card: BoardCard): DashboardOpportunity {
  return {
    amountCents: card.amount_cents,
    assigneeId: card.assigned_to_user_id,
    assigneeName: card.assigneeName,
    closedAt: card.closed_at,
    contactName: card.contactName,
    id: card.id,
    sourceName: card.sourceName,
    stageId: card.stage_id,
    status: card.status,
    title: card.title,
    updatedAt: card.updated_at,
  };
}

function errorCode(result: Extract<BoardResult, { ok: false }>): DashboardErrorCode {
  return result.code === "forbidden" ? "forbidden" : "unavailable";
}

async function loadBucket(
  clinicId: string,
  status: BucketStatus,
): Promise<
  | { readonly ok: true; readonly first: BoardSuccess; readonly bucket: Bucket }
  | { readonly ok: false; readonly code: DashboardErrorCode }
> {
  const first = await listOpportunityBoard({ clinicId, page: 1, pageSize: PAGE_SIZE, status });
  if (!first.ok) return { ok: false, code: errorCode(first) };

  const cards: BoardCard[] = [...first.cards];
  let hasMore = first.hasMore;
  let nextPage = 2;

  while (hasMore && nextPage <= MAX_PAGES) {
    const pages: number[] = [];
    for (let offset = 0; offset < BATCH_SIZE && nextPage + offset <= MAX_PAGES; offset += 1) {
      pages.push(nextPage + offset);
    }
    const results = await Promise.all(pages.map((page) =>
      listOpportunityBoard({ clinicId, page, pageSize: PAGE_SIZE, status })));
    for (const result of results) {
      if (!result.ok) return { ok: false, code: errorCode(result) };
      cards.push(...result.cards);
      // As páginas chegam em ordem: o `hasMore` da última é o que vale.
      hasMore = result.hasMore;
    }
    nextPage += pages.length;
  }

  return { bucket: { cards, complete: !hasMore }, first, ok: true };
}

/**
 * Varre em paralelo os três status do pipeline padrão. O status "aberto"
 * define a disponibilidade da página: sem ele não há visão geral.
 */
export async function loadDashboardData(clinicId: string): Promise<DashboardDataResult> {
  const [open, won, lost] = await Promise.all([
    loadBucket(clinicId, "open"),
    loadBucket(clinicId, "won"),
    loadBucket(clinicId, "lost"),
  ]);

  if (!open.ok) return { ok: false, code: open.code };

  const closedAvailable = won.ok && lost.ok;
  const closedCards = [
    ...(won.ok ? won.bucket.cards : []),
    ...(lost.ok ? lost.bucket.cards : []),
  ];

  return {
    closed: closedCards.map(toOpportunity),
    closedAvailable,
    closedComplete: won.ok && lost.ok && won.bucket.complete && lost.bucket.complete,
    ok: true,
    open: open.bucket.cards.map(toOpportunity),
    openComplete: open.bucket.complete,
    pipeline: open.first.pipeline,
    scope: open.first.scope,
    stages: open.first.stages,
  };
}
