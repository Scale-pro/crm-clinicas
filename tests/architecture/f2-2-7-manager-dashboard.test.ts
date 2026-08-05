import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AttentionPanel } from "@/app/(clinic)/app/_dashboard/attention-panel";
import { DashboardPeriodFilter } from "@/app/(clinic)/app/_dashboard/dashboard-period-filter";
import {
  buildAttentionItems,
  buildStageBreakdown,
  crowdedStages,
  type DashboardOpportunity,
  type DashboardStage,
} from "@/app/(clinic)/app/_dashboard/dashboard-view-model";
import { MetricCard, MetricGrid } from "@/app/(clinic)/app/_dashboard/metric-card";
import { PerformanceTable } from "@/app/(clinic)/app/_dashboard/performance-table";
import { PipelineFunnel } from "@/app/(clinic)/app/_dashboard/pipeline-funnel";

const root = path.resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

function filesUnder(relativeDirectory: string): string[] {
  return readdirSync(path.join(root, relativeDirectory), { withFileTypes: true }).flatMap(
    (entry) => {
      const relative = path.join(relativeDirectory, entry.name);
      return entry.isDirectory() ? filesUnder(relative) : [relative];
    },
  );
}

function readTree(relativeDirectory: string): string {
  return filesUnder(relativeDirectory).map(read).join("\n");
}

const clinicApp = "src/app/(clinic)/app";
const dashboardDirectory = `${clinicApp}/_dashboard`;
const overviewPage = read(`${clinicApp}/page.tsx`);
const dashboardTree = readTree(dashboardDirectory);
const dashboardSurface = filesUnder(dashboardDirectory)
  .filter((file) => !file.endsWith(".test.ts"))
  .map(read)
  .join("\n");

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
];

describe("visão geral do gestor F2.2.7", () => {
  it("entrega a dashboard na rota canônica /app, sem rota concorrente", () => {
    expect(existsSync(path.join(root, `${clinicApp}/page.tsx`))).toBe(true);
    expect(existsSync(path.join(root, `${clinicApp}/dashboard`))).toBe(false);
    expect(existsSync(path.join(root, dashboardDirectory))).toBe(true);
    // A navegação continua apontando "Visão geral" para /app.
    const layout = read(`${clinicApp}/layout.tsx`);
    expect(layout).toContain('{ label: "Visão geral", href: "/app"');
    // Server Component: a página não vira cliente para exibir indicadores.
    expect(overviewPage.startsWith('"use client"')).toBe(false);
    expect(overviewPage).not.toContain('"use client"');
  });

  it("compõe a página a partir de componentes dedicados, sem page.tsx gigante", () => {
    for (const component of [
      "<DashboardHeader",
      "<MetricGrid",
      "<MetricCard",
      "<PipelineFunnel",
      "<AttentionPanel",
      "<OwnerPerformance",
      "<SourcePerformance",
      "<RecentOpportunities",
    ]) {
      expect(overviewPage).toContain(component);
    }
    expect(overviewPage.split("\n").length).toBeLessThan(240);
    // Os cálculos vivem em funções puras testáveis, fora dos componentes.
    expect(existsSync(path.join(root, `${dashboardDirectory}/dashboard-view-model.ts`))).toBe(true);
    expect(existsSync(path.join(root, `${dashboardDirectory}/dashboard-view-model.test.ts`))).toBe(true);
    expect(read(`${dashboardDirectory}/dashboard-view-model.ts`)).not.toContain("react");
  });

  it("usa somente a interface pública dos módulos e nenhum acesso direto ao banco", () => {
    expect(read(`${dashboardDirectory}/dashboard-data.ts`)).toContain('from "@/modules/crm"');
    expect(overviewPage).toContain('from "@/modules/tenancy"');
    for (const forbidden of [
      "createServerSupabaseClient",
      "@supabase/",
      "service_role",
      "SERVICE_ROLE",
      "supabase.",
      "database.types",
    ]) {
      expect(dashboardTree).not.toContain(forbidden);
      expect(overviewPage).not.toContain(forbidden);
    }
    // Internals de módulo continuam proibidos: só `@/modules/<nome>`.
    expect(dashboardTree).not.toMatch(/@\/modules\/[a-z-]+\//);
    expect(overviewPage).not.toMatch(/@\/modules\/[a-z-]+\//);
  });

  it("não autoriza por comparação de cargo — o escopo vem do servidor", () => {
    const sources = [overviewPage, dashboardTree].join("\n");
    expect(sources).not.toMatch(/role\s*===\s*["'`]/);
    expect(sources).not.toMatch(/["'`](?:owner|admin|manager)["'`]\s*===/);
    expect(sources).not.toMatch(/\brole\b\s*(?:!==|\.includes\()/);
    // O escopo exibido é o que o caso de uso devolveu, não uma dedução local.
    expect(overviewPage).toContain('data.scope === "all"');
    expect(overviewPage).toContain("<AccessDeniedState");
  });

  it("valida o período no servidor e o mantém na query string", () => {
    expect(overviewPage).toContain("parsePeriod(params.period)");
    const filter = read(`${dashboardDirectory}/dashboard-period-filter.tsx`);
    expect(filter).toContain("dashboardHref(option.key)");
    expect(filter).not.toContain("localStorage");
    const model = read(`${dashboardDirectory}/dashboard-view-model.ts`);
    expect(model).toContain("/app?period=");
    for (const key of ["7d", "30d", "90d"]) expect(model).toContain(`"${key}"`);
  });

  it("o filtro de período é navegável por links reais e marca o selecionado", () => {
    const html = renderToStaticMarkup(createElement(DashboardPeriodFilter, { period: "90d" }));
    expect(html).toContain('href="/app?period=7d"');
    expect(html).toContain('href="/app?period=30d"');
    expect(html).toContain('href="/app?period=90d"');
    expect(html).toContain('aria-label="Período dos indicadores"');
    // aria-current apenas no período ativo.
    expect([...html.matchAll(/aria-current="true"/g)]).toHaveLength(1);
    expect(html).toMatch(/href="\/app\?period=90d"[^>]*aria-current="true"|aria-current="true"[^>]*href="\/app\?period=90d"/);
    // Sem <button> ou JavaScript obrigatório para trocar o período.
    expect(html).not.toContain("<button");
  });

  it("cartões de indicador expõem rótulo e valor com semântica de lista de descrição", () => {
    const html = renderToStaticMarkup(createElement(
      MetricGrid,
      { label: "Indicadores do período" },
      createElement(MetricCard, {
        detail: "oportunidades em andamento",
        key: "open",
        label: "Oportunidades abertas",
        value: "12",
      }),
      createElement(MetricCard, {
        key: "rate",
        label: "Taxa de conversão",
        srValue: "sem encerramentos no período",
        value: "—",
      }),
    ));
    expect(html).toContain("<dl");
    expect(html).toContain("<dt");
    expect(html).toContain("<dd");
    expect(html).toContain("Oportunidades abertas");
    expect(html).toContain("12");
    // Valor abreviado/simbólico vem acompanhado da leitura completa.
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("sem encerramentos no período");
  });

  it("o funil descreve cada etapa em texto e a barra é apenas reforço visual", () => {
    const rows = buildStageBreakdown(stages, [
      opportunity({ id: "a", stageId: "stage-1" }),
      opportunity({ id: "b", stageId: "stage-1" }),
      opportunity({ id: "c", stageId: "stage-2" }),
      opportunity({ id: "d", stageId: "stage-2" }),
    ]);
    const html = renderToStaticMarkup(createElement(PipelineFunnel, {
      headingId: "funnel",
      openCount: 4,
      rows,
    }));
    expect(html).toContain('aria-labelledby="funnel"');
    expect(html).toContain('id="funnel"');
    expect(html).toContain("Novo");
    expect(html).toContain("Avaliação");
    // Percentual e valor aparecem como texto, não só como largura de barra.
    expect([...html.matchAll(/50%<\/span>/g)].length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("Valor em aberto na etapa");
    // A barra é proporcional e não carrega informação exclusiva.
    expect(html).toContain("width:50%");
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain("recharts");
  });

  it("o funil mostra estado vazio humano quando não há oportunidades abertas", () => {
    const html = renderToStaticMarkup(createElement(PipelineFunnel, {
      headingId: "funnel",
      openCount: 0,
      rows: buildStageBreakdown(stages, []),
    }));
    expect(html).toContain("Ainda não há oportunidades abertas nesta pipeline.");
    expect(html).not.toContain("width:");
  });

  it("o painel de atenção lista gargalos reais com link para a oportunidade", () => {
    const open = [
      opportunity({ assigneeId: null, assigneeName: "Sem responsável", id: "sem-dono", updatedAt: daysAgo(2) }),
      opportunity({ id: "parada", updatedAt: daysAgo(30) }),
      opportunity({ id: "em-dia", updatedAt: daysAgo(1) }),
    ];
    const rows = buildStageBreakdown(stages, open);
    const html = renderToStaticMarkup(createElement(AttentionPanel, {
      crowded: crowdedStages(rows),
      headingId: "attention",
      items: buildAttentionItems(open, now),
    }));
    expect(html).toContain('href="/app/opportunities/sem-dono"');
    expect(html).toContain('href="/app/opportunities/parada"');
    expect(html).not.toContain('href="/app/opportunities/em-dia"');
    expect(html).toContain("Sem responsável");
    expect(html).toContain("sem atualização há 30 dias");
    expect(html).toContain('href="/app/leads');
    // Sem botão dentro de link.
    expect(html).not.toMatch(/<a[^>]*>[\s\S]*?<button/);
  });

  it("as tabelas de desempenho têm caption e cabeçalhos de linha", () => {
    const html = renderToStaticMarkup(createElement(PerformanceTable, {
      caption: "Comparativo por responsável.",
      description: "Abertas hoje e encerramentos dos 30 dias.",
      emptyDescription: "vazio",
      emptyTitle: "vazio",
      entityLabel: "Responsável",
      headingId: "owners",
      rows: [{
        conversion: 0.5,
        key: "user-1",
        label: "Ana Ribeiro",
        lostCount: 1,
        openCount: 2,
        wonAmountCents: 50_000,
        wonCount: 1,
      }],
      showPeriodResults: true,
      title: "Desempenho por responsável",
    }));
    expect(html).toContain("<caption");
    expect(html).toContain("Comparativo por responsável.");
    expect(html).toContain('scope="row"');
    expect(html).toContain("Ana Ribeiro");
    expect(html).toContain("500,00");
    expect(html).toContain("50%");
    expect(html).not.toContain("user-1<");
  });

  it("omite as colunas do período quando o histórico não veio completo", () => {
    const html = renderToStaticMarkup(createElement(PerformanceTable, {
      caption: "Comparativo por responsável.",
      description: "Abertas hoje e encerramentos dos 30 dias.",
      emptyDescription: "vazio",
      emptyTitle: "vazio",
      entityLabel: "Responsável",
      headingId: "owners",
      rows: [{
        conversion: 0.5,
        key: "user-1",
        label: "Ana Ribeiro",
        lostCount: 1,
        openCount: 2,
        wonAmountCents: 50_000,
        wonCount: 1,
      }],
      showPeriodResults: false,
      title: "Desempenho por responsável",
    }));
    // Nada de conversão ou valor ganho apurado sobre um recorte parcial.
    expect(html).toContain("Em aberto");
    expect(html).not.toContain("Conversão");
    expect(html).not.toContain("Valor ganho");
    expect(html).not.toContain("500,00");
    expect(html).not.toContain("50%");
    expect(html).toContain("não pôde ser apurado com o conjunto atual de dados");
  });

  it("não exibe dados fictícios, estado persistente nem mensagens técnicas", () => {
    for (const forbidden of [
      "localStorage",
      "sessionStorage",
      "Math.random",
      "SQLSTATE",
      "PGRST",
      "error.message",
    ]) {
      expect(dashboardTree).not.toContain(forbidden);
      expect(overviewPage).not.toContain(forbidden);
    }
    expect(dashboardSurface).not.toMatch(/\b(?:mock|fake|dummy|demo|lorem|stub|seed|sample)(?:Data|Rows|Values|Items)\b/i);
    expect(dashboardSurface).not.toMatch(/dadosFicticios|placeholderRows/i);
    expect(dashboardSurface).not.toMatch(/\{\s*(?:result|data)\.code\s*\}/);
    // Nenhuma métrica com valor literal na superfície da dashboard: os únicos
    // números aceitos são zeros de acumulador, nunca resultados prontos.
    expect(dashboardSurface).not.toMatch(
      /(?:amountCents|amountLabel|wonCount|lostCount|openCount|count|share|conversion)\s*:\s*(?:[1-9]|0\.\d)/,
    );
  });

  it("declara escopo parcial em vez de apresentar totais incompletos", () => {
    const loader = read(`${dashboardDirectory}/dashboard-data.ts`);
    expect(loader).toContain("hasMore");
    expect(loader).toContain("MAX_PAGES");
    expect(loader).toContain("complete");
    expect(overviewPage).toContain("data.openComplete");
    expect(overviewPage).toContain("data.closedComplete");
    expect(overviewPage).toContain("<PartialDataNotice");
    expect(read(`${dashboardDirectory}/dashboard-empty-state.tsx`)).toContain("PartialDataNotice");
  });

  it("cobre os estados de interface com mensagens humanas", () => {
    expect(overviewPage).toContain("<ErrorState");
    expect(overviewPage).toContain("<AccessDeniedState");
    expect(overviewPage).toContain("<DashboardEmptyState");
    expect(overviewPage).toContain("Nenhuma oportunidade foi encerrada neste período.");
    expect(overviewPage).toContain("Alguns indicadores não estão disponíveis");
    expect(existsSync(path.join(root, `${clinicApp}/loading.tsx`))).toBe(true);
    expect(existsSync(path.join(root, `${clinicApp}/error.tsx`))).toBe(true);
  });

  it("mantém a formatação centralizada em pt-BR", () => {
    expect(dashboardSurface).not.toContain("Intl.NumberFormat");
    expect(dashboardSurface).not.toContain("Intl.DateTimeFormat");
    expect(dashboardSurface).toContain("formatBrlFromCents");
    expect(overviewPage).toContain("formatClinicDateTime");
    const percent = read("src/shared/lib/percent.ts");
    expect(percent).toContain('"pt-BR"');
    expect(percent).toContain("maximumFractionDigits: 1");
  });

  it("continua sem seletor de pipelines e sem contrato ainda não integrado", () => {
    expect(dashboardSurface).toContain("Pipeline padrão");
    expect(dashboardSurface).not.toContain("pipelineId=");
    expect(dashboardSurface).not.toMatch(/listPipelines|createPipeline|setDefaultPipeline|pipelineSelector/i);
    expect(overviewPage).not.toContain('name="pipeline"');
  });

  it("não altera o backend nem adiciona dependências", () => {
    // A contagem acompanha o backend já mesclado na main (F2.2.6 multi-pipeline
    // e F2.3.1 profissionais/procedimentos). O que esta entrega garante é não
    // contribuir com nenhuma migration própria: a F2.2.7 é exclusivamente
    // frontend/UX.
    const migrations = filesUnder("supabase/migrations");
    expect(migrations.length).toBe(31);
    expect(migrations.some((file) => file.includes("f2_2_7"))).toBe(false);
    const packageJson = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(Object.keys(packageJson.dependencies)).toEqual([
      "@radix-ui/react-slot",
      "@supabase/ssr",
      "@supabase/supabase-js",
      "class-variance-authority",
      "clsx",
      "lucide-react",
      "next",
      "react",
      "react-dom",
      "server-only",
      "tailwind-merge",
      "zod",
    ]);
    expect(packageJson.devDependencies).not.toHaveProperty("recharts");
    expect(dashboardTree).not.toMatch(/from "(?:recharts|chart\.js|d3|victory|nivo)/);
  });

  it("mantém a grade responsiva sem medidas fixas em pixels", () => {
    expect(dashboardSurface).not.toMatch(/\b(?:min-)?w-\[\d+px\]/);
    expect(dashboardSurface).not.toMatch(/\bh-\[\d+px\]/);
    expect(overviewPage).toContain("grid-cols-1");
    expect(overviewPage).toContain("xl:grid-cols-2");
    expect(read(`${dashboardDirectory}/metric-card.tsx`)).toContain("sm:grid-cols-2");
  });
});
