import { listAllOpportunities, listPipelines } from "@/modules/crm";
import { formatClinicDateTime } from "@/shared/lib/date";

import { opportunityStatus, type OpportunityRowView } from "./crm-view-models";

/**
 * Oportunidades de um contato.
 *
 * **Limitação do contrato público:** `search_opportunity_board` não aceita
 * filtro por contato. Ele devolve `contact_id` em cada linha, então o único
 * caminho honesto é varrer as páginas do quadro e selecionar as do contato —
 * jamais buscar pelo nome dele, o que traria oportunidades de homônimos e
 * misturaria dados entre pessoas.
 *
 * A varredura é limitada: se o teto for atingido, a lista é devolvida com
 * `complete: false` e a tela avisa que pode haver mais. É melhor dizer "pode
 * faltar" do que afirmar um total que não foi verificado.
 *
 * O escopo continua sendo do servidor: quem só tem `opportunity.view_own` vê
 * apenas as próprias, e isso é informado na tela.
 */

const PAGE_SIZE = 100;
/** Teto da varredura: 5 páginas ≈ 500 oportunidades da clínica. */
const MAX_PAGES = 5;

export type ContactOpportunitiesResult =
  | {
    readonly status: "ok";
    readonly rows: readonly OpportunityRowView[];
    readonly complete: boolean;
    readonly scope: string;
  }
  | { readonly status: "forbidden" }
  | { readonly status: "error" };

export async function loadContactOpportunities(params: {
  readonly clinicId: string;
  readonly contactId: string;
  readonly timezone: string;
}): Promise<ContactOpportunitiesResult> {
  const { clinicId, contactId, timezone } = params;

  type Card = {
    id: string;
    contact_id: string;
    pipeline_id: string;
    stage_id: string;
    status: string;
    title: string;
    amount_cents: number | null;
    updated_at: string;
    assigneeName: string;
    sourceName: string | null;
  };

  const matched: Card[] = [];
  let complete = false;
  let scope = "own";

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await listAllOpportunities({
      clinicId,
      page,
      pageSize: PAGE_SIZE,
      status: "all",
    });
    if (!result.ok) {
      return result.code === "forbidden" ? { status: "forbidden" } : { status: "error" };
    }
    scope = result.scope;
    for (const card of result.cards) {
      if (card.contact_id === contactId) matched.push(card as Card);
    }
    if (!result.hasMore) {
      complete = true;
      break;
    }
  }

  // Nomes de pipeline e de etapa não vêm na busca do quadro quando ela cobre
  // todas as pipelines. `listPipelines` devolve as duas coisas de uma vez, em
  // uma única chamada — inclusive das pipelines arquivadas, para que uma
  // oportunidade antiga não perca o nome da etapa.
  const pipelineResult = await listPipelines({ clinicId, includeArchived: true });
  const pipelineNames = new Map<string, string>();
  const stageNames = new Map<string, string>();
  if (pipelineResult.ok) {
    for (const pipeline of pipelineResult.pipelines) {
      pipelineNames.set(pipeline.id, pipeline.name);
      for (const stage of pipeline.stages) stageNames.set(stage.id, stage.name);
    }
  }

  const rows: readonly OpportunityRowView[] = matched.map((card) => ({
    amountCents: card.amount_cents,
    assigneeName: card.assigneeName,
    href: `/app/opportunities/${encodeURIComponent(card.id)}`,
    id: card.id,
    pipelineName: pipelineNames.get(card.pipeline_id) ?? null,
    sourceName: card.sourceName,
    stageName: stageNames.get(card.stage_id) ?? null,
    status: opportunityStatus(card.status),
    title: card.title,
    updatedAtLabel: formatClinicDateTime(card.updated_at, timezone),
  }));

  return { complete, rows, scope, status: "ok" };
}
