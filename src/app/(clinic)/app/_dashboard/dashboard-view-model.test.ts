import { describe, expect, it } from "vitest";

import {
  attentionReasons,
  averageTicketCents,
  buildAttentionItems,
  buildOwnerPerformance,
  buildRecent,
  buildSourcePerformance,
  buildStageBreakdown,
  buildSummary,
  closedWithinPeriod,
  conversionRate,
  crowdedStages,
  DEFAULT_PERIOD,
  dashboardHref,
  daysSince,
  isStale,
  parsePeriod,
  periodOption,
  periodRange,
  staleLabel,
  STALE_AFTER_DAYS,
  UNKNOWN_SOURCE_LABEL,
  type DashboardOpportunity,
  type DashboardStage,
} from "./dashboard-view-model";

const now = new Date("2026-07-28T12:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function opportunity(overrides: Partial<DashboardOpportunity> = {}): DashboardOpportunity {
  return {
    amountCents: 100_00,
    assigneeId: "user-1",
    assigneeName: "Ana Ribeiro",
    closedAt: null,
    contactName: "Contato",
    id: "opp-1",
    sourceName: "Instagram",
    stageId: "stage-1",
    status: "open",
    title: "Oportunidade",
    updatedAt: daysAgo(1),
    ...overrides,
  };
}

const stages: readonly DashboardStage[] = [
  { id: "stage-1", name: "Novo", position: 1, stage_kind: "open" },
  { id: "stage-2", name: "Avaliação", position: 2, stage_kind: "open" },
  { id: "stage-3", name: "Ganha", position: 3, stage_kind: "won" },
];

describe("período da visão geral", () => {
  it("aceita apenas 7d, 30d e 90d", () => {
    expect(parsePeriod("7d")).toBe("7d");
    expect(parsePeriod("30d")).toBe("30d");
    expect(parsePeriod("90d")).toBe("90d");
  });

  it("volta para 30d em qualquer valor inválido", () => {
    for (const invalid of ["", "1d", "365d", "30", "abc", "7D", null, undefined, ["7d"], 7]) {
      expect(parsePeriod(invalid)).toBe("30d");
    }
    expect(DEFAULT_PERIOD).toBe("30d");
  });

  it("expõe o período na query string, mantendo a URL compartilhável", () => {
    expect(dashboardHref("7d")).toBe("/app?period=7d");
    expect(dashboardHref("30d")).toBe("/app?period=30d");
    expect(dashboardHref("90d")).toBe("/app?period=90d");
  });

  it("calcula a janela em UTC a partir do instante atual", () => {
    const range = periodRange("7d", now);
    expect(range.end.toISOString()).toBe("2026-07-28T12:00:00.000Z");
    expect(range.start.toISOString()).toBe("2026-07-21T12:00:00.000Z");
    expect(periodOption("90d").days).toBe(90);
  });

  it("seleciona somente as oportunidades encerradas dentro da janela", () => {
    const range = periodRange("30d", now);
    const inside = opportunity({ closedAt: daysAgo(10), id: "inside", status: "won" });
    const border = opportunity({ closedAt: daysAgo(30), id: "border", status: "won" });
    const outside = opportunity({ closedAt: daysAgo(31), id: "outside", status: "won" });
    const never = opportunity({ closedAt: null, id: "never" });
    const invalid = opportunity({ closedAt: "não é data", id: "invalid" });
    const selected = closedWithinPeriod([inside, border, outside, never, invalid], range);
    expect(selected.map((item) => item.id)).toEqual(["inside", "border"]);
  });
});

describe("taxa de conversão e ticket médio", () => {
  it("usa apenas oportunidades encerradas na fórmula ganhas / (ganhas + perdidas)", () => {
    expect(conversionRate(3, 1)).toBeCloseTo(0.75, 10);
    expect(conversionRate(1, 3)).toBeCloseTo(0.25, 10);
    expect(conversionRate(5, 0)).toBe(1);
  });

  it("devolve null quando não houve encerramentos, sem dividir por zero", () => {
    expect(conversionRate(0, 0)).toBeNull();
    expect(Number.isNaN(conversionRate(0, 0) ?? 0)).toBe(false);
  });

  it("não considera as oportunidades abertas no denominador", () => {
    const open = [opportunity({ id: "a" }), opportunity({ id: "b" }), opportunity({ id: "c" })];
    const closed = [
      opportunity({ closedAt: daysAgo(2), id: "won", status: "won" }),
      opportunity({ closedAt: daysAgo(3), id: "lost", status: "lost" }),
    ];
    const summary = buildSummary({ closedInPeriod: closed, now, open });
    expect(summary.openCount).toBe(3);
    expect(summary.conversion).toBeCloseTo(0.5, 10);
  });

  it("calcula o ticket médio ganho e devolve null sem oportunidades ganhas", () => {
    expect(averageTicketCents(30_000, 3)).toBe(10_000);
    expect(averageTicketCents(10_001, 3)).toBe(3334);
    expect(averageTicketCents(0, 0)).toBeNull();
    expect(averageTicketCents(50_000, 0)).toBeNull();
  });
});

describe("soma de valores", () => {
  it("soma amount_cents ignorando oportunidades sem valor informado", () => {
    const summary = buildSummary({
      closedInPeriod: [],
      now,
      open: [
        opportunity({ amountCents: 12_345, id: "a" }),
        opportunity({ amountCents: null, id: "b" }),
        opportunity({ amountCents: 10_555, id: "c" }),
      ],
    });
    expect(summary.openAmountCents).toBe(22_900);
    expect(summary.openWithoutAmountCount).toBe(1);
  });

  it("soma o valor ganho no período e ignora as perdidas", () => {
    const summary = buildSummary({
      closedInPeriod: [
        opportunity({ amountCents: 20_000, closedAt: daysAgo(1), id: "w1", status: "won" }),
        opportunity({ amountCents: 10_000, closedAt: daysAgo(2), id: "w2", status: "won" }),
        opportunity({ amountCents: 90_000, closedAt: daysAgo(2), id: "l1", status: "lost" }),
      ],
      now,
      open: [],
    });
    expect(summary.wonCount).toBe(2);
    expect(summary.wonAmountCents).toBe(30_000);
    expect(summary.lostCount).toBe(1);
    expect(summary.closedCount).toBe(3);
    expect(summary.averageWonTicketCents).toBe(15_000);
  });
});

describe("oportunidades paradas", () => {
  it("considera parada a oportunidade aberta sem atualização há sete dias ou mais", () => {
    expect(STALE_AFTER_DAYS).toBe(7);
    expect(isStale(daysAgo(6), now)).toBe(false);
    expect(isStale(daysAgo(7), now)).toBe(true);
    expect(isStale(daysAgo(30), now)).toBe(true);
  });

  it("conta dias inteiros e ignora datas inválidas", () => {
    expect(daysSince(daysAgo(3), now)).toBe(3);
    expect(daysSince(now.toISOString(), now)).toBe(0);
    expect(daysSince("data inválida", now)).toBeNull();
    expect(isStale("data inválida", now)).toBe(false);
  });

  it("conta somente as abertas paradas no indicador", () => {
    const summary = buildSummary({
      closedInPeriod: [],
      now,
      open: [
        opportunity({ id: "fresh", updatedAt: daysAgo(1) }),
        opportunity({ id: "stale-1", updatedAt: daysAgo(9) }),
        opportunity({ id: "stale-2", updatedAt: daysAgo(40) }),
      ],
    });
    expect(summary.staleCount).toBe(2);
  });

  it("descreve o tempo sem atualização em texto humano", () => {
    expect(staleLabel(0)).toBe("atualizada hoje");
    expect(staleLabel(1)).toBe("sem atualização há 1 dia");
    expect(staleLabel(12)).toBe("sem atualização há 12 dias");
  });
});

describe("painel precisam de atenção", () => {
  it("sinaliza apenas oportunidades sem responsável ou paradas", () => {
    expect(attentionReasons(opportunity(), now)).toEqual([]);
    expect(attentionReasons(opportunity({ assigneeId: null }), now)).toEqual(["unassigned"]);
    expect(attentionReasons(opportunity({ updatedAt: daysAgo(8) }), now)).toEqual(["stale"]);
    expect(attentionReasons(opportunity({ assigneeId: null, updatedAt: daysAgo(8) }), now))
      .toEqual(["unassigned", "stale"]);
  });

  it("ordena por sem responsável, depois tempo parado e depois valor", () => {
    const items = buildAttentionItems([
      opportunity({ amountCents: 1_000, id: "owner-old", updatedAt: daysAgo(40) }),
      opportunity({ amountCents: 5_000, assigneeId: null, id: "free-new", updatedAt: daysAgo(1) }),
      opportunity({ amountCents: 9_000, assigneeId: null, id: "free-old", updatedAt: daysAgo(20) }),
      opportunity({ amountCents: 8_000, id: "owner-recent", updatedAt: daysAgo(9) }),
      opportunity({ amountCents: 3_000, id: "owner-fresh", updatedAt: daysAgo(2) }),
    ], now);
    expect(items.map((item) => item.id))
      .toEqual(["free-old", "free-new", "owner-old", "owner-recent"]);
    expect(items.some((item) => item.id === "owner-fresh")).toBe(false);
  });

  it("desempata pelo maior valor comercial e depois pelo identificador", () => {
    const items = buildAttentionItems([
      opportunity({ amountCents: 100, id: "b", updatedAt: daysAgo(10) }),
      opportunity({ amountCents: 900, id: "c", updatedAt: daysAgo(10) }),
      opportunity({ amountCents: null, id: "a", updatedAt: daysAgo(10) }),
    ], now);
    expect(items.map((item) => item.id)).toEqual(["c", "b", "a"]);
  });

  it("limita a lista e aponta cada item para a oportunidade real", () => {
    const many = Array.from({ length: 12 }, (_, index) => opportunity({
      assigneeId: null,
      id: `opp-${index}`,
      updatedAt: daysAgo(index + 1),
    }));
    const items = buildAttentionItems(many, now, 8);
    expect(items).toHaveLength(8);
    expect(items[0]!.href).toBe(`/app/opportunities/${items[0]!.id}`);
  });
});

describe("agrupamento por etapa", () => {
  it("respeita a ordem das etapas do servidor e soma valores por etapa", () => {
    const rows = buildStageBreakdown(stages, [
      opportunity({ amountCents: 10_000, id: "a", stageId: "stage-1" }),
      opportunity({ amountCents: 20_000, id: "b", stageId: "stage-1" }),
      opportunity({ amountCents: null, id: "c", stageId: "stage-2" }),
    ]);
    expect(rows.map((row) => row.name)).toEqual(["Novo", "Avaliação", "Ganha"]);
    expect(rows[0]).toMatchObject({ amountCents: 30_000, count: 2 });
    expect(rows[0]!.share).toBeCloseTo(2 / 3, 10);
    expect(rows[1]).toMatchObject({ amountCents: 0, count: 1 });
    expect(rows[2]).toMatchObject({ count: 0, share: 0 });
  });

  it("não divide por zero quando não há oportunidades abertas", () => {
    const rows = buildStageBreakdown(stages, []);
    expect(rows.every((row) => row.share === 0 && row.count === 0)).toBe(true);
  });

  it("aponta concentração só quando há mais de uma etapa ocupada", () => {
    const single = buildStageBreakdown(stages, [opportunity({ id: "a", stageId: "stage-1" })]);
    expect(crowdedStages(single)).toEqual([]);

    const spread = buildStageBreakdown(stages, [
      opportunity({ id: "a", stageId: "stage-1" }),
      opportunity({ id: "b", stageId: "stage-1" }),
      opportunity({ id: "c", stageId: "stage-1" }),
      opportunity({ id: "d", stageId: "stage-2" }),
    ]);
    expect(crowdedStages(spread).map((row) => row.name)).toEqual(["Novo"]);
    expect(crowdedStages(spread, 0.9)).toEqual([]);
  });
});

describe("agrupamento por responsável e por origem", () => {
  const open = [
    opportunity({ assigneeId: "user-1", assigneeName: "Ana", id: "o1", sourceName: "Instagram" }),
    opportunity({ assigneeId: "user-2", assigneeName: "Bruno", id: "o2", sourceName: null }),
    opportunity({ assigneeId: null, assigneeName: "Sem responsável", id: "o3", sourceName: null }),
  ];
  const closed = [
    opportunity({
      amountCents: 50_000,
      assigneeId: "user-1",
      assigneeName: "Ana",
      closedAt: daysAgo(2),
      id: "c1",
      sourceName: "Instagram",
      status: "won",
    }),
    opportunity({
      amountCents: 90_000,
      assigneeId: "user-1",
      assigneeName: "Ana",
      closedAt: daysAgo(3),
      id: "c2",
      sourceName: "Instagram",
      status: "lost",
    }),
    opportunity({
      amountCents: 10_000,
      assigneeId: "user-2",
      assigneeName: "Bruno",
      closedAt: daysAgo(4),
      id: "c3",
      sourceName: null,
      status: "won",
    }),
  ];

  it("agrupa por responsável usando o nome, nunca o identificador", () => {
    const rows = buildOwnerPerformance(open, closed);
    expect(rows.map((row) => row.label)).toEqual(["Ana", "Bruno", "Sem responsável"]);
    expect(rows.some((row) => /^user-/.test(row.label))).toBe(false);
    expect(rows[0]).toMatchObject({
      lostCount: 1,
      openCount: 1,
      wonAmountCents: 50_000,
      wonCount: 1,
    });
    expect(rows[0]!.conversion).toBeCloseTo(0.5, 10);
    expect(rows[2]).toMatchObject({ conversion: null, openCount: 1, wonCount: 0 });
  });

  it("agrupa por origem e nomeia a ausência de origem de forma humana", () => {
    const rows = buildSourcePerformance(open, closed);
    expect(rows.map((row) => row.label)).toEqual(["Instagram", UNKNOWN_SOURCE_LABEL]);
    expect(rows.map((row) => row.label)).not.toContain("null");
    expect(rows[0]).toMatchObject({ lostCount: 1, openCount: 1, wonAmountCents: 50_000 });
    expect(rows[1]).toMatchObject({ openCount: 2, wonAmountCents: 10_000, wonCount: 1 });
  });

  it("devolve lista vazia quando não há nada para comparar", () => {
    expect(buildOwnerPerformance([], [])).toEqual([]);
    expect(buildSourcePerformance([], [])).toEqual([]);
  });
});

describe("oportunidades recentes", () => {
  it("ordena pela atualização mais recente e limita a lista", () => {
    const rows = buildRecent([
      opportunity({ id: "old", updatedAt: daysAgo(10) }),
      opportunity({ id: "new", updatedAt: daysAgo(1) }),
      opportunity({ id: "middle", updatedAt: daysAgo(5) }),
    ], 2);
    expect(rows.map((row) => row.id)).toEqual(["new", "middle"]);
  });

  it("não altera a lista recebida", () => {
    const input = [
      opportunity({ id: "old", updatedAt: daysAgo(10) }),
      opportunity({ id: "new", updatedAt: daysAgo(1) }),
    ];
    buildRecent(input);
    expect(input.map((row) => row.id)).toEqual(["old", "new"]);
  });
});

describe("estado vazio", () => {
  it("zera os totais sem inventar valores quando não há oportunidades", () => {
    const summary = buildSummary({ closedInPeriod: [], now, open: [] });
    expect(summary).toMatchObject({
      averageWonTicketCents: null,
      closedCount: 0,
      conversion: null,
      lostCount: 0,
      openAmountCents: 0,
      openCount: 0,
      staleCount: 0,
      wonAmountCents: 0,
      wonCount: 0,
    });
    expect(buildAttentionItems([], now)).toEqual([]);
    expect(buildRecent([])).toEqual([]);
  });
});
