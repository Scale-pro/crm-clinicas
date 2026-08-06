import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
const layout = read(`${clinicApp}/layout.tsx`);
const pipelineTree = readTree(`${clinicApp}/pipeline`);
const pipelinePage = read(`${clinicApp}/pipeline/page.tsx`);
const leadsPage = read(`${clinicApp}/leads/page.tsx`);
const settingsPipelineTree = readTree(`${clinicApp}/settings/pipeline`);
const sharedUi = readTree("src/shared/ui");

describe("shell, Kanban e lista de leads F2.2.5", () => {
  it("mantém a sidebar restrita às áreas entregues e sem funcionalidades futuras", () => {
    for (const href of ["/app", "/app/pipeline", "/app/leads", "/app/contacts", "/app/team", "/app/settings"]) {
      expect(layout).toContain(`"${href}"`);
    }
    expect(layout).toContain('"/app/account"');
    expect(layout).toContain('"/app/security"');
    // Agenda/Hoje/Financeiro saíram desta lista quando a F4 os entregou de
    // verdade. O que segue proibido é rota de área ainda não implementada.
    expect(layout).not.toMatch(
      /href: "\/app\/(?:whatsapp|conversations|conversas|reports|relatorios|automations|automacoes|ai)"/i,
    );
    expect(layout).not.toContain("localStorage");
  });

  it("entrega shell com sidebar, cabeçalho, drawer mobile e link para o conteúdo", () => {
    expect(layout).toContain("<AppSidebar");
    expect(layout).toContain("<AppHeader");
    expect(layout).toContain("<MobileNavigation");
    expect(layout).toContain('href="#main-content"');
    expect(layout).toContain('id="main-content"');
    // Sidebar fixa no desktop, drawer no mobile.
    expect(layout).toMatch(/hidden[^"]*lg:block/);
    const mobile = read(`${clinicApp}/_shell/mobile-navigation.tsx`);
    expect(mobile).toContain("<dialog");
    expect(mobile).toContain("showModal()");
    expect(mobile).toContain('aria-label="Abrir navegação"');
    expect(mobile).toContain("onCancel");
  });

  it("rodapé da sidebar expõe clínica ativa, conta e logout", () => {
    const sidebar = read(`${clinicApp}/_shell/app-sidebar.tsx`);
    expect(sidebar).toContain("Clínica ativa");
    expect(sidebar).toContain("accountItems");
    expect(sidebar).toContain('action="/auth/logout"');
    expect(sidebar).toContain('method="post"');
    // Estrutura preparada para múltiplos pipelines, sem simular nenhum.
    expect(sidebar).toContain("pipelines");
    expect(layout).not.toContain("pipelines={");
  });

  it("dá prefixos de ID distintos às sidebars desktop e mobile", () => {
    // As duas instâncias coexistem no DOM; IDs repetidos fariam o label da
    // sidebar mobile apontar para o select oculto da sidebar desktop.
    const switcher = read(`${clinicApp}/_shell/clinic-switcher.tsx`);
    expect(switcher).toContain("idPrefix");
    expect(switcher).toContain("const selectId = `${idPrefix}-active-clinic`");
    expect(switcher).toContain("htmlFor={selectId}");
    expect(switcher).toContain("id={selectId}");
    expect(switcher).not.toContain('id="sidebar-active-clinic"');
    // Sem IDs aleatórios: precisam casar entre servidor e cliente.
    expect(switcher).not.toMatch(/useId|Math\.random|randomUUID/);

    const sidebar = read(`${clinicApp}/_shell/app-sidebar.tsx`);
    expect(sidebar).toContain("idPrefix: string;");
    expect(sidebar).toContain("idPrefix={idPrefix}");

    const prefixes = [...layout.matchAll(/renderSidebar\("([^"]+)"\)/g)].map((match) => match[1]!);
    expect(prefixes).toHaveLength(2);
    expect(new Set(prefixes).size).toBe(2);
  });

  it("remonta o editor de etapas quando a assinatura vinda do servidor muda", () => {
    // Sem isso, uma etapa recém-criada só apareceria após recarregar a página.
    const page = read(`${clinicApp}/settings/pipeline/page.tsx`);
    expect(page).toContain("const stageSignature = board.stages.map((stage) => stage.id).join(\":\")");
    expect(page).toMatch(/<StageEditor[^>]*key=\{stageSignature\}/);
    // A assinatura acompanha IDs e ordem, não um contador ou índice arbitrário.
    expect(page).not.toMatch(/key=\{(?:Date\.now|Math\.random|index)/);
  });

  it("remove o editor de etapas do Kanban e o move para as configurações", () => {
    expect(existsSync(path.join(root, `${clinicApp}/pipeline/stage-manager.tsx`))).toBe(false);
    // As Server Actions continuam declaradas em pipeline/actions.ts; o que sai
    // do quadro é a interface de edição de etapas.
    const pipelineSurface = filesUnder(`${clinicApp}/pipeline`)
      .filter((file) => !file.endsWith("actions.ts"))
      .map(read)
      .join("\n");
    expect(pipelineSurface).not.toContain("StageManager");
    expect(pipelineSurface).not.toContain("StageEditor");
    expect(pipelineSurface).not.toContain("reorderPipelineStagesFormAction");
    expect(pipelineSurface).not.toContain("createPipelineStageFormAction");
    expect(pipelineSurface).not.toContain("updatePipelineStageFormAction");
    expect(existsSync(path.join(root, `${clinicApp}/settings/pipeline/page.tsx`))).toBe(true);
    expect(settingsPipelineTree).toContain("reorderPipelineStagesFormAction");
    expect(settingsPipelineTree).toContain("createPipelineStageFormAction");
    expect(settingsPipelineTree).toContain("updatePipelineStageFormAction");
  });

  it("o Kanban só oferece um link para /app/settings/pipeline, gated por pipeline.manage", () => {
    expect(pipelinePage).toContain('href="/app/settings/pipeline"');
    expect(pipelinePage).toContain("Configurar etapas");
    expect(pipelinePage).toContain('requirePermission(context.clinic.id, "pipeline.manage")');
    expect(pipelinePage).toMatch(/manageAccess\.allowed \?[\s\S]{0,200}\/app\/settings\/pipeline/);
    const settings = read(`${clinicApp}/settings/page.tsx`);
    expect(settings).toContain('requirePermission(context.clinic.id, "pipeline.manage")');
    expect(settings).toMatch(/manageAccess\.allowed \?/);
  });

  it("a tela de etapas revalida a permissão no servidor e mostra acesso negado", () => {
    const page = read(`${clinicApp}/settings/pipeline/page.tsx`);
    expect(page).toContain('requirePermission(context.clinic.id, "pipeline.manage")');
    expect(page).toContain("<AccessDeniedState");
    expect(page).toContain("<ErrorState");
    // stage_kind imutável e etapas de encerramento preservadas.
    const editor = read(`${clinicApp}/settings/pipeline/stage-editor.tsx`);
    expect(editor).toContain("Encerramento");
    expect(editor).toContain("stage_kind");
    expect(editor).not.toMatch(/deletePipelineStage|removeStage|archiveStage/);
    // A RPC exige a lista completa de etapas na reordenação.
    expect(editor).toContain("fullOrder");
    expect(editor).toContain("stages.map(");
  });

  it("cria nova oportunidade em overlay reaproveitando a Server Action existente", () => {
    expect(pipelinePage).toContain("<Drawer");
    expect(pipelinePage).toContain("Nova oportunidade");
    expect(pipelineTree).toContain("createOpportunityFormAction");
    expect(pipelineTree).toContain('name="idempotencyKey"');
    expect(pipelineTree).toContain('name="confirmedExistingOpen"');
    expect(pipelineTree).toContain('name="contactQ"');
    // Formulário não fica permanentemente aberto na página.
    expect(pipelinePage).not.toContain("<details");
    const drawer = read("src/shared/ui/drawer.tsx");
    expect(drawer).toContain("<dialog");
    expect(drawer).toContain("showModal()");
    expect(drawer).toContain("aria-labelledby");
    expect(drawer).toContain("onCancel");
    expect(drawer).toContain('aria-label="Fechar painel"');
  });

  it("mantém a movimentação acessível sem depender de arrastar e soltar", () => {
    expect(pipelineTree).toContain("Mover para etapa");
    expect(pipelineTree).toContain("moveOpportunityFormAction");
    expect(pipelineTree).toContain('name="expectedVersion"');
    for (const forbidden of ["onDragEnd", "onDragStart", "draggable", "useDraggable"]) {
      expect(pipelineTree).not.toContain(forbidden);
    }
  });

  it("colunas do Kanban mostram nome, contagem, soma e acento da etapa", () => {
    const header = read(`${clinicApp}/pipeline/_components/pipeline-stage-header.tsx`);
    expect(header).toContain("headingId");
    expect(header).toContain("totalLabel");
    expect(header).toContain("backgroundColor: accent");
    expect(pipelinePage).toContain("sumAmountCents(stageRows)");
    expect(pipelinePage).toContain("<KanbanBoard");
    expect(pipelinePage).toContain("<KanbanColumn");
    expect(pipelinePage).toContain("<KanbanCard");
  });

  it("expõe /app/leads com busca, filtros e paginação server-side", () => {
    expect(existsSync(path.join(root, `${clinicApp}/leads/page.tsx`))).toBe(true);
    expect(leadsPage).toContain("listOpportunityBoard");
    expect(leadsPage).toContain("<OpportunityFilters");
    expect(leadsPage).toContain("<PaginationBar");
    expect(leadsPage).toContain("<OpportunityTable");
    expect(leadsPage).toContain("<EmptyState");
    expect(leadsPage).toContain("<ErrorState");
    expect(leadsPage).toContain("board.scope");
    const filters = read(`${clinicApp}/_components/opportunity-filters.tsx`);
    expect(filters).toContain('method="get"');
    for (const field of ["assignee", "source", "statusFilter", "pageSize"]) {
      expect(filters).toContain(`name="${field}"`);
    }
    expect(filters).toContain("<SearchField");
    // Sem filtragem apenas no navegador.
    expect(read(`${clinicApp}/_components/opportunity-table.tsx`)).not.toMatch(/rows\.filter\(\(row\) => row\.(title|contactName)/);
  });

  it("a lista de leads está preparada para múltiplos pipelines sem simular nenhum", () => {
    const table = read(`${clinicApp}/_components/opportunity-table.tsx`);
    expect(table).toContain("showPipelineColumn");
    expect(read(`${clinicApp}/_components/opportunity-view.ts`)).toContain("pipelineName");
    expect(leadsPage).not.toContain("showPipelineColumn");
    for (const forbidden of ["duplicatePipeline", "archivePipeline", "setDefaultPipeline", "movePipeline", "createPipelineFormAction"]) {
      expect(readTree(clinicApp)).not.toContain(forbidden);
    }
  });

  it("não introduz superfícies de fases futuras nem dados simulados", () => {
    const files = filesUnder(clinicApp).join("\n");
    // `agenda`/`financeiro` deixaram de ser fases futuras na F4 e passaram a ter
    // backend, permissão e RLS próprios. `whatsapp` saiu da lista na F2/WhatsApp
    // pelo mesmo critério: schema, RLS, RPCs e permissões `conversation.*` já
    // estão na main. Uma caixa de entrada dedicada (`conversations`) continua
    // sendo fase futura — a conversa aparece dentro do pipeline.
    expect(files).not.toMatch(/tasks|conversations|messages|reports|automations/i);
    const tree = readTree(clinicApp);
    expect(tree).not.toMatch(/mockData|fakeData|dadosFicticios|placeholderRows/i);
    expect(tree).not.toContain("localStorage");
    expect(tree).not.toContain("sessionStorage");
  });

  it("não altera o backend nem contorna os casos de uso do domínio", () => {
    // A contagem acompanha o backend já mesclado na main (F2.2.6 multi-pipeline
    // e F2.3.1 profissionais/procedimentos incluídos). O que esta entrega
    // garante é não contribuir com nenhuma migration própria: a F2.2.5 é
    // exclusivamente frontend/UX.
    const migrations = filesUnder("supabase/migrations");
    expect(migrations.length).toBeGreaterThanOrEqual(28);
    expect(migrations.some((file) => file.includes("f2_2_5"))).toBe(false);
    const tree = readTree(clinicApp);
    expect(tree).not.toContain("@supabase/");
    expect(tree).not.toContain("createServerSupabaseClient");
    expect(tree).not.toContain("service_role");
    expect(tree).not.toContain("SERVICE_ROLE");
    // Só a interface pública dos módulos.
    expect(tree).not.toMatch(/@\/modules\/[a-z-]+\//);
    expect(tree).not.toContain("console.");
    expect(sharedUi).not.toContain("@/modules/");
  });

  it("preserva estados de interface e mensagens seguras ao usuário", () => {
    for (const source of [pipelinePage, leadsPage]) {
      expect(source).toContain("<EmptyState");
      expect(source).toContain("<ErrorState");
    }
    expect(existsSync(path.join(root, `${clinicApp}/loading.tsx`))).toBe(true);
    expect(existsSync(path.join(root, `${clinicApp}/error.tsx`))).toBe(true);
    expect(read("src/shared/ui/feedback-banner.tsx")).toContain('role={tone === "success" ? "status" : "alert"}');
    const rendered = [pipelinePage, leadsPage, settingsPipelineTree, readTree(`${clinicApp}/_components`)].join("\n");
    expect(rendered).not.toMatch(/\{result\.code\}|error\.message|PGRST|\bSQLSTATE\b/);
  });

  it("mantém acessibilidade mínima nos controles novos", () => {
    expect(read("src/shared/ui/actions-menu.tsx")).toContain("aria-label={label}");
    expect(read("src/shared/ui/actions-menu.tsx")).toContain("aria-expanded={open}");
    expect(read("src/shared/ui/filter-popover.tsx")).toContain("aria-controls={panelId}");
    expect(read("src/shared/ui/search-field.tsx")).toContain("htmlFor={id}");
    expect(read("src/shared/ui/data-table.tsx")).toContain("aria-label={label}");
    expect(read(`${clinicApp}/_shell/sidebar-nav.tsx`)).toContain("aria-label={label}");
    expect(read(`${clinicApp}/_shell/sidebar-nav.tsx`)).toContain('aria-current={active ? "page" : undefined}');
    expect(sharedUi).toContain("focus-visible:");
  });

  it("usa larguras responsivas, sem medidas fixas em pixels", () => {
    const responsiveSources = [readTree(clinicApp), sharedUi].join("\n");
    expect(responsiveSources).not.toMatch(/\b(?:min-)?w-\[\d+px\]/);
    expect(responsiveSources).not.toMatch(/\bh-\[\d+px\]/);
    expect(responsiveSources).not.toMatch(/style=\{\{\s*width:\s*["']\d+px/);
    expect(read(`${clinicApp}/pipeline/_components/kanban-column.tsx`)).toContain("w-[min(");
  });
});
