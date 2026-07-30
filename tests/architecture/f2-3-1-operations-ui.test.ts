import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OperationsFilterBar } from "@/app/(clinic)/app/_operations/operations-filters";
import { emptyWeek } from "@/app/(clinic)/app/_operations/operations-validation";
import type {
  ProcedureProfessionalLinkView,
  ProcedureSummaryView,
  ProfessionalDetailView,
  ProfessionalSummaryView,
} from "@/app/(clinic)/app/_operations/operations-view-models";
import { ProcedureDetail } from "@/app/(clinic)/app/_operations/procedure-detail";
import { ProcedureForm } from "@/app/(clinic)/app/_operations/procedure-form";
import { ProcedureList } from "@/app/(clinic)/app/_operations/procedure-list";
import { ProfessionalDetail } from "@/app/(clinic)/app/_operations/professional-detail";
import { ProfessionalForm } from "@/app/(clinic)/app/_operations/professional-form";
import { ProfessionalList } from "@/app/(clinic)/app/_operations/professional-list";
import { ProfessionalProcedureEditor } from "@/app/(clinic)/app/_operations/professional-procedure-editor";
import { SpecialtyEditor } from "@/app/(clinic)/app/_operations/specialty-editor";
import { WeeklyAvailabilityEditor } from "@/app/(clinic)/app/_operations/weekly-availability-editor";

const root = path.resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

function filesUnder(relativeDirectory: string): string[] {
  return readdirSync(path.join(root, relativeDirectory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(relativeDirectory, entry.name);
    return entry.isDirectory() ? filesUnder(relative) : [relative];
  });
}

const clinicApp = "src/app/(clinic)/app";
const operationsDirectory = `${clinicApp}/_operations`;
const operationsFiles = filesUnder(operationsDirectory);
/** Somente o código que vai a produção — arquivos de teste ficam de fora. */
const operationsSurfaceFiles = operationsFiles.filter((file) => !file.endsWith(".test.ts"));
const operationsSurface = operationsSurfaceFiles.map(read).join("\n");
const operationsTree = operationsFiles.map(read).join("\n");
const professionalsPage = read(`${clinicApp}/settings/professionals/page.tsx`);
const proceduresPage = read(`${clinicApp}/settings/procedures/page.tsx`);
const pages = `${professionalsPage}\n${proceduresPage}`;

// --- Modelos de apresentação usados apenas nestes testes -------------------
// Fixtures vivem exclusivamente aqui: nenhuma delas existe no código de
// produção, que nunca monta linhas literais.

function professional(overrides: Partial<ProfessionalSummaryView> = {}): ProfessionalSummaryView {
  return {
    availabilityLabel: "5 dias • 45h por semana",
    colorToken: "verde",
    displayName: "Ana Ribeiro",
    enabledProcedureCount: 4,
    href: "/app/settings/professionals/ana-ribeiro",
    id: "professional-1",
    linkedUserName: "Ana Ribeiro",
    specialties: ["Harmonização facial", "Peeling"],
    status: "active",
    weekdaysLabel: "Seg, Ter, Qua, Qui, Sex",
    ...overrides,
  };
}

function professionalDetail(): ProfessionalDetailView {
  return {
    ...professional(),
    availability: emptyWeek(),
    email: "ana@clinica.example",
    notes: null,
    phoneLabel: "(11) 91234-5678",
    registrationNumber: "12345",
    registrationType: "CRM",
  };
}

function procedure(overrides: Partial<ProcedureSummaryView> = {}): ProcedureSummaryView {
  return {
    basePriceCents: 25_000,
    category: "Facial",
    colorToken: "azul",
    durationMinutes: 60,
    enabledProfessionalCount: 2,
    href: "/app/settings/procedures/limpeza-de-pele",
    id: "procedure-1",
    name: "Limpeza de pele",
    status: "active",
    ...overrides,
  };
}

function link(overrides: Partial<ProcedureProfessionalLinkView> = {}): ProcedureProfessionalLinkView {
  return {
    colorToken: "verde",
    displayName: "Ana Ribeiro",
    durationOverrideMinutes: null,
    enabled: true,
    priceOverrideCents: null,
    professionalId: "professional-1",
    specialties: ["Peeling"],
    ...overrides,
  };
}

describe("fundação de operações da clínica F2.3.1 — rotas", () => {
  it("entrega as rotas preparadas dentro de configurações", () => {
    expect(existsSync(path.join(root, `${clinicApp}/settings/professionals/page.tsx`))).toBe(true);
    expect(existsSync(path.join(root, `${clinicApp}/settings/procedures/page.tsx`))).toBe(true);
    // O trabalho vive em componentes reutilizáveis, não nas páginas.
    expect(professionalsPage.split("\n").length).toBeLessThan(70);
    expect(proceduresPage.split("\n").length).toBeLessThan(70);
    expect(operationsSurfaceFiles.length).toBeGreaterThan(10);
  });

  it("não anuncia a área na navegação principal enquanto o fluxo não é ponta a ponta", () => {
    const layout = read(`${clinicApp}/layout.tsx`);
    const settingsIndex = read(`${clinicApp}/settings/page.tsx`);
    for (const source of [layout, settingsIndex]) {
      expect(source).not.toContain("/app/settings/professionals");
      expect(source).not.toContain("/app/settings/procedures");
    }
  });

  it("resolve tenant e permissão de verdade, sem comparação de cargo", () => {
    for (const page of [professionalsPage, proceduresPage]) {
      expect(page).toContain('from "@/modules/tenancy"');
      expect(page).toContain('requirePermission(context.clinic.id, "clinic.manage")');
      expect(page).toContain("<AccessDeniedState");
    }
    const sources = `${pages}\n${operationsSurface}`;
    expect(sources).not.toMatch(/role\s*===\s*["'`]/);
    expect(sources).not.toMatch(/["'`](?:owner|admin|manager)["'`]\s*===/);
    expect(sources).not.toMatch(/\brole\b\s*(?:!==|\.includes\()/);
  });

  it("declara o estado real de integração pendente em vez de dados ou ações falsas", () => {
    expect(professionalsPage).toContain('state="unavailable"');
    expect(proceduresPage).toContain('state="unavailable"');
    expect(professionalsPage).toContain("rows={[]}");
    expect(proceduresPage).toContain("rows={[]}");
    // Nenhuma página monta formulário sem ação real por trás.
    expect(pages).not.toContain("<ProfessionalForm");
    expect(pages).not.toContain("<ProcedureForm");
    const state = read(`${operationsDirectory}/operations-states.tsx`);
    expect(state).toContain("Cadastro ainda não disponível");
  });
});

describe("fundação de operações da clínica F2.3.1 — fronteiras", () => {
  it("não acessa o banco nem o SDK do Supabase", () => {
    for (const forbidden of [
      "createServerSupabaseClient",
      "@supabase/",
      "@/shared/db",
      "database.types",
      "service_role",
      "SERVICE_ROLE",
      "supabase.rpc",
    ]) {
      expect(operationsTree).not.toContain(forbidden);
      expect(pages).not.toContain(forbidden);
    }
  });

  it("usa apenas a interface pública dos módulos", () => {
    expect(operationsTree).not.toMatch(/@\/modules\/[a-z-]+\//);
    expect(pages).not.toMatch(/@\/modules\/[a-z-]+\//);
  });

  it("não cria Server Action nem simula persistência", () => {
    expect(operationsTree).not.toContain('"use server"');
    expect(pages).not.toContain('"use server"');
    for (const forbidden of ["localStorage", "sessionStorage", "Math.random", "setTimeout("]) {
      expect(operationsSurface).not.toContain(forbidden);
    }
    // A ação de salvar sempre chega por prop — nunca é inventada no componente.
    expect(read(`${operationsDirectory}/professional-form.tsx`)).toContain("onSubmit: (values: ProfessionalFormValues)");
    expect(read(`${operationsDirectory}/procedure-form.tsx`)).toContain("onSubmit: (values: ProcedureFormValues)");
  });

  it("não leva dados fictícios para produção — fixtures só em teste", () => {
    expect(operationsSurface).not.toMatch(/\b(?:mock|fake|dummy|demo|lorem|stub|seed|sample)(?:Data|Rows|Values|Items|Professionals|Procedures)\b/i);
    expect(operationsSurface).not.toMatch(/dadosFicticios|placeholderRows/i);
    // Nenhum registro pronto na superfície: nem identificador, nem valor.
    expect(operationsSurface).not.toMatch(/\bid\s*:\s*["'`]/);
    expect(operationsSurface).not.toMatch(/(?:basePriceCents|priceOverrideCents|durationOverrideMinutes|enabledProcedureCount|enabledProfessionalCount)\s*:\s*[1-9]/);
    expect(operationsSurface).not.toContain("Ana Ribeiro");
    // As fixtures existem — e só existem — em arquivos de teste.
    for (const file of operationsFiles) {
      if (read(file).includes("Ana Ribeiro")) expect(file.endsWith(".test.ts")).toBe(true);
    }
  });

  it("não altera o backend nem adiciona dependências", () => {
    // A contagem acompanha o backend já mesclado na main. As quatro migrations
    // `f2_3_1_*` existentes são do **backend** de agenda (schema, permissões e
    // RPCs de profissionais/procedimentos), entregues pela main — não desta
    // entrega, que é exclusivamente visual e não contribui com nenhuma.
    const migrations = filesUnder("supabase/migrations");
    expect(migrations.length).toBeGreaterThanOrEqual(28);
    expect(migrations.every((file) => file.endsWith(".sql"))).toBe(true);
    // A superfície de operações não carrega SQL nem esquema próprio.
    expect(operationsFiles.some((file) => file.endsWith(".sql"))).toBe(false);
    expect(operationsTree).not.toMatch(/create\s+(?:table|policy|function|index)\b/i);
    expect(operationsTree).not.toContain("supabase/migrations");
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
    // Nenhuma biblioteca de formulário, máscara ou data foi introduzida.
    expect(operationsTree).not.toMatch(/from "(?:react-hook-form|formik|yup|dayjs|date-fns|luxon|imask|react-input-mask)/);
  });

  it("mantém a formatação centralizada em pt-BR", () => {
    expect(operationsSurface).not.toContain("Intl.NumberFormat");
    expect(operationsSurface).not.toContain("Intl.DateTimeFormat");
    expect(operationsSurface).toContain("formatBrlFromCents");
    expect(operationsSurface).toContain("formatMinutesAsDuration");
    expect(read("src/shared/lib/currency.ts")).toContain('"pt-BR"');
  });
});

describe("listagem de profissionais", () => {
  it("renderiza tabela no desktop e cartões no mobile, sem exibir identificadores", () => {
    const html = renderToStaticMarkup(createElement(ProfessionalList, {
      rows: [professional(), professional({ displayName: "Bruno Lima", id: "professional-2", linkedUserName: null, status: "inactive" })],
      totalCount: 2,
    }));
    expect(html).toContain("Ana Ribeiro");
    expect(html).toContain("Bruno Lima");
    expect(html).toContain("Harmonização facial");
    expect(html).toContain("Sem conta vinculada");
    expect(html).toContain("Seg, Ter, Qua, Qui, Sex");
    expect(html).toContain("Ativo");
    expect(html).toContain("Inativo");
    expect(html).toContain('href="/app/settings/professionals/ana-ribeiro"');
    // O identificador técnico nunca aparece como conteúdo.
    expect(html).not.toContain(">professional-1<");
    // Tabela só no desktop, lista de cartões só no mobile.
    expect(html).toContain("md:hidden");
    expect(html).toContain("hidden min-h-0 md:flex");
    expect(html).toContain("<table");
    expect(html).toContain("<caption");
    expect(html).toContain('scope="row"');
    expect(html).toContain("2 de 2 profissional(is)");
  });

  it("distingue lista vazia de busca sem resultado", () => {
    const empty = renderToStaticMarkup(createElement(ProfessionalList, { rows: [] }));
    expect(empty).toContain("Nenhum profissional cadastrado");

    const filtered = renderToStaticMarkup(createElement(ProfessionalList, { hasFilters: true, rows: [] }));
    expect(filtered).toContain("Nenhum profissional para estes filtros");
    expect(filtered).not.toContain("Nenhum profissional cadastrado");
  });

  it("cobre carregamento, erro e integração pendente", () => {
    const loading = renderToStaticMarkup(createElement(ProfessionalList, { rows: [], state: "loading" }));
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Carregando profissionais…");

    const error = renderToStaticMarkup(createElement(ProfessionalList, { rows: [], state: "error" }));
    expect(error).toContain('role="alert"');
    expect(error).toContain("Não foi possível carregar os profissionais");
    // Nunca expõe detalhe técnico do erro.
    expect(error).not.toMatch(/SQLSTATE|PGRST|stack/i);

    const unavailable = renderToStaticMarkup(createElement(ProfessionalList, { rows: [], state: "unavailable" }));
    expect(unavailable).toContain("Cadastro ainda não disponível");
  });

  it("só mostra a ação de criar quando a permissão resolvida no servidor permite", () => {
    const withPermission = renderToStaticMarkup(createElement(ProfessionalList, {
      canCreate: true,
      createSlot: createElement("button", { type: "button" }, "Novo profissional"),
      rows: [professional()],
    }));
    expect(withPermission).toContain("Novo profissional");

    const withoutPermission = renderToStaticMarkup(createElement(ProfessionalList, {
      canCreate: false,
      createSlot: createElement("button", { type: "button" }, "Novo profissional"),
      rows: [professional()],
    }));
    expect(withoutPermission).not.toContain("Novo profissional");
  });
});

describe("listagem de procedimentos", () => {
  it("mostra duração, preço-base e habilitados — nunca métricas financeiras", () => {
    const html = renderToStaticMarkup(createElement(ProcedureList, {
      rows: [procedure(), procedure({ basePriceCents: 0, category: null, id: "procedure-2", name: "Avaliação" })],
      totalCount: 2,
    }));
    expect(html).toContain("Limpeza de pele");
    expect(html).toContain("1h");
    expect(html).toMatch(/R\$&nbsp;250,00|R\$\s250,00/);
    expect(html).toMatch(/R\$&nbsp;0,00|R\$\s0,00/);
    expect(html).toContain("Sem categoria");
    expect(html).toContain("<caption");
    expect(html).toContain("md:hidden");
    for (const forbidden of ["Faturamento", "Lucro", "Margem", "Custo", "Comissão", "Imposto"]) {
      expect(html).not.toContain(forbidden);
    }
  });

  it("cobre vazio, filtros sem resultado e integração pendente", () => {
    expect(renderToStaticMarkup(createElement(ProcedureList, { rows: [] })))
      .toContain("Nenhum procedimento cadastrado");
    expect(renderToStaticMarkup(createElement(ProcedureList, { hasFilters: true, rows: [] })))
      .toContain("Nenhum procedimento para estes filtros");
    expect(renderToStaticMarkup(createElement(ProcedureList, { rows: [], state: "unavailable" })))
      .toContain("Cadastro ainda não disponível");
  });
});

describe("busca e filtros", () => {
  it("filtra no servidor por query string, com rótulos vinculados", () => {
    const html = renderToStaticMarkup(createElement(OperationsFilterBar, {
      basePath: "/app/settings/professionals",
      facetLabel: "Especialidade",
      facetName: "specialty",
      facetOptions: ["Harmonização facial", "Peeling"],
      facetValue: "Peeling",
      idPrefix: "professionals",
      search: "ana",
      searchLabel: "Pesquisar profissionais",
      searchPlaceholder: "Nome ou especialidade",
      status: "active",
    }));
    expect(html).toContain('method="get"');
    expect(html).toContain('action="/app/settings/professionals"');
    expect(html).toContain('for="professionals-q"');
    expect(html).toContain('id="professionals-status"');
    expect(html).toContain('for="professionals-status"');
    expect(html).toContain('id="professionals-facet"');
    expect(html).toContain('name="specialty"');
    expect(html).toContain("Harmonização facial");
    // Dois filtros ativos além da pesquisa.
    expect(html).toContain("2 filtro(s) além da pesquisa");
    expect(html).not.toContain("localStorage");
  });
});

describe("formulário de profissional", () => {
  const html = renderToStaticMarkup(createElement(ProfessionalForm, {
    mode: "create",
    onClose: () => {},
    onSubmit: () => {},
    open: true,
    teamMembers: [{ id: "user-1", name: "Ana Ribeiro" }],
    timezoneLabel: "America/Sao_Paulo",
  }));

  it("é um diálogo acessível com rótulo, descrição e botão de fechar", () => {
    expect(html).toContain("<dialog");
    expect(html).toContain("aria-labelledby");
    expect(html).toContain("aria-describedby");
    expect(html).toContain('aria-label="Fechar painel"');
    expect(html).toContain("Novo profissional");
  });

  it("tem todos os campos pedidos, com rótulos reais e agrupamento semântico", () => {
    for (const label of [
      "Nome de exibição",
      "E-mail",
      "Telefone",
      "Tipo de registro profissional",
      "Número de registro",
      "Cor da agenda",
      "Observações",
      "Situação",
      "Especialidades",
      "Usuário da equipe",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend");
    // Todo rótulo aponta para um controle existente.
    const controlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]!));
    for (const match of html.matchAll(/\sfor="([^"]+)"/g)) {
      expect(controlIds.has(match[1]!)).toBe(true);
    }
  });

  it("permite profissional sem conta vinculada e sem registro", () => {
    expect(html).toContain("Sem conta vinculada");
    expect(html).toContain("Sem registro");
    expect(html).toContain("mesmo sem conta de acesso");
  });

  it("embute o editor de especialidades e a disponibilidade semanal", () => {
    expect(html).toContain("Disponibilidade semanal");
    expect(html).toContain("America/Sao_Paulo");
    expect(html).toContain("Segunda-feira");
    expect(html).toContain("Domingo");
    expect(html).toContain("Nenhuma especialidade adicionada");
  });

  it("no modo edição parte dos valores recebidos e mantém a máscara sem corromper", () => {
    const editing = renderToStaticMarkup(createElement(ProfessionalForm, {
      initialValues: {
        displayName: "Bruno Lima",
        phone: "11912345678",
        specialties: ["Peeling"],
        status: "inactive",
      },
      mode: "edit",
      onClose: () => {},
      onSubmit: () => {},
      open: true,
    }));
    expect(editing).toContain("Editar profissional");
    expect(editing).toContain('value="Bruno Lima"');
    // Máscara só na exibição; nada de dígito perdido.
    expect(editing).toContain('value="(11) 91234-5678"');
    expect(editing).toContain("Peeling");
    expect(editing).toContain("Salvar alterações");
  });
});

describe("editor de especialidades", () => {
  it("expõe campo rotulado, contador e estado vazio humano", () => {
    const html = renderToStaticMarkup(createElement(SpecialtyEditor, {
      onChange: () => {},
      specialties: [],
    }));
    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend");
    expect(html).toContain("Nova especialidade");
    expect(html).toContain("Nenhuma especialidade adicionada");
    expect(html).toContain("0 de 12 especialidades");
    expect(html).toContain('aria-live="polite"');
  });

  it("cada chip tem botão de remoção com nome acessível próprio", () => {
    const html = renderToStaticMarkup(createElement(SpecialtyEditor, {
      onChange: () => {},
      specialties: ["Peeling", "Botox"],
    }));
    expect(html).toContain('aria-label="Remover especialidade Peeling"');
    expect(html).toContain('aria-label="Remover especialidade Botox"');
    expect(html).toContain("2 de 12 especialidades");
    expect(html).toContain('aria-label="Especialidades adicionadas"');
  });
});

describe("editor de disponibilidade semanal", () => {
  it("lista os sete dias com controle próprio e resumo de carga", () => {
    const html = renderToStaticMarkup(createElement(WeeklyAvailabilityEditor, {
      availability: emptyWeek(),
      onChange: () => {},
    }));
    for (const label of [
      "Segunda-feira",
      "Terça-feira",
      "Quarta-feira",
      "Quinta-feira",
      "Sexta-feira",
      "Sábado",
      "Domingo",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Nenhum horário definido");
    expect(html).toContain("Sem atendimento");
    expect(html).toContain("não pode passar da meia-noite");
    expect([...html.matchAll(/type="checkbox"/g)]).toHaveLength(7);
  });

  it("marca a sobreposição com texto e ícone, não apenas com cor", () => {
    const availability = {
      ...emptyWeek(),
      monday: {
        enabled: true,
        ranges: [
          { end: "13:00", id: "m1", start: "08:00" },
          { end: "18:00", id: "m2", start: "12:00" },
        ],
      },
    };
    const html = renderToStaticMarkup(createElement(WeeklyAvailabilityEditor, {
      availability,
      onChange: () => {},
    }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("2 intervalo(s) precisam de ajuste");
    expect(html).toContain("Este intervalo se sobrepõe a outro do mesmo dia.");
    expect(html).toContain('aria-invalid="true"');
  });

  it("aceita intervalos adjacentes sem alarme e oferece cópia entre dias", () => {
    const availability = {
      ...emptyWeek(),
      monday: {
        enabled: true,
        ranges: [
          { end: "12:00", id: "m1", start: "08:00" },
          { end: "18:00", id: "m2", start: "12:00" },
        ],
      },
    };
    const html = renderToStaticMarkup(createElement(WeeklyAvailabilityEditor, {
      availability,
      onChange: () => {},
    }));
    expect(html).not.toContain("precisam de ajuste");
    expect(html).not.toContain('aria-invalid="true"');
    // Carga semanal somada a partir dos dois trechos adjacentes (4h + 6h).
    expect(html).toContain("1 dia • 10h por semana");
    expect(html).toContain("Copiar para segunda a sexta");
    expect(html).toContain("Copiar para…");
    // Cada campo de horário tem rótulo próprio e único.
    expect(html).toContain("Início 1 · Segunda-feira");
    expect(html).toContain("Fim 2 · Segunda-feira");
  });
});

describe("formulário de procedimento", () => {
  const html = renderToStaticMarkup(createElement(ProcedureForm, {
    categories: ["Facial", "Corporal"],
    mode: "create",
    onClose: () => {},
    onSubmit: () => {},
    open: true,
  }));

  it("tem os campos pedidos e explica a personalização por profissional", () => {
    for (const label of ["Nome do procedimento", "Descrição", "Categoria", "Duração padrão", "Preço-base", "Cor na agenda", "Situação"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("poderão ser personalizados por profissional");
    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend");
  });

  it("apresenta preço em BRL, aceita zero e não oferece valor negativo", () => {
    expect(html).toContain("R$");
    expect(html).toContain("Use 0,00 para procedimento sem cobrança");
    expect(html).toContain("Valores negativos não são aceitos");
    // Nenhum campo permite digitar sinal negativo.
    expect(html).not.toContain('min="-');
    expect(read("src/shared/ui/money-input.tsx")).toContain('/[^\\d.,]/g');
  });

  it("oferece atalhos de duração comuns em minutos", () => {
    expect(html).toContain('aria-label="Durações frequentes"');
    for (const preset of ["30min", "45min", "1h", "1h 30min"]) expect(html).toContain(preset);
    expect(html).toContain("minutos");
    expect(html).toContain('inputMode="numeric"');
  });

  it("não trata custo, imposto, insumo, comissão nem margem", () => {
    for (const forbidden of ["Custo", "Imposto", "Insumo", "Comissão", "Margem", "Lucro"]) {
      expect(html).not.toContain(forbidden);
    }
  });
});

describe("editor de profissionais habilitados no procedimento", () => {
  it("mostra valor herdado, valor efetivo e indicador de personalização em texto", () => {
    const html = renderToStaticMarkup(createElement(ProfessionalProcedureEditor, {
      basePriceCents: 25_000,
      baseDurationMinutes: 60,
      links: [
        link(),
        link({ displayName: "Bruno Lima", durationOverrideMinutes: 90, priceOverrideCents: 32_000, professionalId: "professional-2" }),
      ],
      onChange: () => {},
    }));
    expect(html).toContain("2 de 2 profissional(is) habilitado(s)");
    expect(html).toContain("Usa o padrão");
    expect(html).toContain("Personalizado");
    expect(html).toContain("(herdada do padrão)");
    expect(html).toContain("(personalizada)");
    expect(html).toContain("(herdado do padrão)");
    expect(html).toContain("(personalizado)");
    expect(html).toContain("Voltar à duração padrão");
    expect(html).toContain("Voltar ao preço-base");
    expect(html).toMatch(/R\$&nbsp;320,00|R\$\s320,00/);
    expect(html).toContain("1h 30min");
    // Nenhum cálculo de margem ou comissão.
    for (const forbidden of ["Margem", "Comissão", "Lucro"]) expect(html).not.toContain(forbidden);
  });

  it("pede confirmação antes de remover o vínculo", () => {
    const html = renderToStaticMarkup(createElement(ProfessionalProcedureEditor, {
      basePriceCents: 25_000,
      baseDurationMinutes: 60,
      links: [link()],
      onChange: () => {},
    }));
    expect(html).toContain("Remover profissional deste procedimento?");
    expect(html).toContain("Remover habilitação");
    expect(html).toContain("Manter habilitado");
  });

  it("declara quando não há profissional cadastrado", () => {
    const html = renderToStaticMarkup(createElement(ProfessionalProcedureEditor, {
      basePriceCents: 25_000,
      baseDurationMinutes: 60,
      links: [],
      onChange: () => {},
    }));
    expect(html).toContain("Nenhum profissional cadastrado");
  });

  it("oferece busca de profissional com rótulo vinculado", () => {
    const html = renderToStaticMarkup(createElement(ProfessionalProcedureEditor, {
      basePriceCents: 25_000,
      baseDurationMinutes: 60,
      links: [link()],
      onChange: () => {},
    }));
    expect(html).toContain("Buscar profissional");
    expect(html).toContain('type="search"');
  });
});

describe("detalhe do profissional e do procedimento", () => {
  it("organiza o profissional em abas acessíveis, com histórico apenas estrutural", () => {
    const html = renderToStaticMarkup(createElement(ProfessionalDetail, {
      professional: professionalDetail(),
    }));
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Seções do profissional"');
    expect([...html.matchAll(/role="tab"/g)]).toHaveLength(5);
    for (const tab of ["Informações", "Especialidades", "Disponibilidade", "Procedimentos", "Histórico"]) {
      expect(html).toContain(tab);
    }
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain("CRM 12345");
    expect(html).toContain("(11) 91234-5678");
  });

  it("permite omitir a aba de histórico enquanto atendimentos não existem", () => {
    const html = renderToStaticMarkup(createElement(ProfessionalDetail, {
      professional: professionalDetail(),
      showHistoryTab: false,
    }));
    expect([...html.matchAll(/role="tab"/g)]).toHaveLength(4);
    expect(html).not.toContain("Histórico");
  });

  it("o detalhe do procedimento resume sem métricas financeiras", () => {
    const html = renderToStaticMarkup(createElement(ProcedureDetail, {
      links: [link(), link({ displayName: "Bruno Lima", enabled: false, professionalId: "professional-2" })],
      procedure: { ...procedure(), description: "Higienização profunda." },
    }));
    expect(html).toContain("Limpeza de pele");
    expect(html).toContain("Duração padrão");
    expect(html).toContain("Preço-base");
    expect(html).toContain("Higienização profunda.");
    expect(html).toContain("1 de 2");
    // Somente os habilitados aparecem na lista.
    expect(html).toContain("Ana Ribeiro");
    expect(html).not.toContain("Bruno Lima");
    for (const forbidden of ["Faturamento", "Margem", "Custo", "Comissão"]) {
      expect(html).not.toContain(forbidden);
    }
  });
});

describe("acessibilidade e responsividade", () => {
  it("nunca comunica estado apenas por cor", () => {
    const html = renderToStaticMarkup(createElement(ProfessionalList, {
      rows: [professional({ status: "inactive" })],
    }));
    // A cor da agenda vem acompanhada do nome da cor.
    expect(html).toContain("Verde");
    expect(html).toContain("Inativo");
    const colorIndicator = read("src/shared/ui/color-indicator.tsx");
    expect(colorIndicator).toContain("sr-only");
    expect(colorIndicator).toContain('aria-hidden="true"');
  });

  it("mantém o layout fluido, sem medidas fixas em pixels", () => {
    expect(operationsSurface).not.toMatch(/\b(?:min-|max-)?w-\[\d+px\]/);
    expect(operationsSurface).not.toMatch(/\bh-\[\d+px\]/);
    // A rolagem horizontal fica contida na tabela; o corpo da página não rola.
    expect(read("src/shared/ui/data-table.tsx")).toContain("overflow-x-auto");
    expect(operationsSurface).toContain("md:hidden");
    expect(operationsSurface).toContain("sm:grid-cols-2");
  });

  it("os diálogos usam <dialog> nativo — foco preso, Escape e retorno de foco", () => {
    const panel = read(`${operationsDirectory}/form-panel.tsx`);
    expect(panel).toContain("showModal()");
    expect(panel).toContain("onCancel");
    expect(panel).toContain("opener.focus()");
    expect(panel).toContain("Descartar alterações?");
    expect(read("src/shared/ui/confirm-dialog.tsx")).toContain("showModal()");
  });

  it("erros são anunciados, marcados com aria-invalid e resumidos com atalho", () => {
    const summary = read("src/shared/ui/error-summary.tsx");
    expect(summary).toContain('role="alert"');
    expect(summary).toContain("tabIndex={-1}");
    expect(summary).toContain('href={`#${entry.fieldId}`}');
    const form = read(`${operationsDirectory}/professional-form.tsx`);
    expect(form).toContain("aria-invalid");
    expect(form).toContain("document.getElementById(focusRequest.fieldId)?.focus()");
    expect(form).toContain("<ErrorSummary");
  });

  it("os campos de valor sincronizam mudanças externas da prop fora de edição", () => {
    // MoneyInput e DurationInput não podem exibir um valor antigo quando a prop
    // muda (ex.: 'voltar ao preço-base'/'à duração padrão' zeram o override).
    for (const file of ["src/shared/ui/money-input.tsx", "src/shared/ui/duration-input.tsx"]) {
      const source = read(file);
      expect(source).toContain("resolveSyncedText");
      expect(source).toContain("setEditing(true)");
      expect(source).toContain("setEditing(false)");
    }
  });

  it("os formulários reiniciam em transições reais, limpando erros e foco", () => {
    for (const file of ["professional-form.tsx", "procedure-form.tsx"]) {
      const source = read(`${operationsDirectory}/${file}`);
      expect(source).toContain("shouldResetForm");
      // Reiniciar zera valores, erros, tentativa e pedido de foco da edição anterior.
      expect(source).toContain("setValues(initial)");
      expect(source).toContain("setErrors({})");
      expect(source).toContain("setAttempted(0)");
      expect(source).toContain("setFocusRequest(null)");
    }
  });
});
