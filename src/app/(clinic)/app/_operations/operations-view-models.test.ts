import { describe, expect, it } from "vitest";

import {
  AGENDA_COLORS,
  activeFilterCount,
  agendaColor,
  collectCategories,
  collectSpecialties,
  countEnabledLinks,
  effectiveDurationMinutes,
  effectivePriceCents,
  filterProcedures,
  filterProfessionals,
  hasAnyOverride,
  hasDurationOverride,
  hasPriceOverride,
  statusLabel,
  statusTone,
  type ProcedureProfessionalLinkView,
  type ProcedureSummaryView,
  type ProfessionalSummaryView,
} from "./operations-view-models";

function professional(overrides: Partial<ProfessionalSummaryView> = {}): ProfessionalSummaryView {
  return {
    availabilityLabel: "5 dias • 45h por semana",
    colorToken: "azul",
    displayName: "Ana Ribeiro",
    enabledProcedureCount: 3,
    href: "/app/settings/professionals/ana",
    id: "professional-1",
    linkedUserName: null,
    specialties: ["Harmonização facial"],
    status: "active",
    weekdaysLabel: "Seg, Ter, Qua, Qui, Sex",
    ...overrides,
  };
}

function procedure(overrides: Partial<ProcedureSummaryView> = {}): ProcedureSummaryView {
  return {
    basePriceCents: 25_000,
    category: "Facial",
    colorToken: "azul",
    durationMinutes: 60,
    enabledProfessionalCount: 2,
    href: "/app/settings/procedures/limpeza",
    id: "procedure-1",
    name: "Limpeza de pele",
    status: "active",
    ...overrides,
  };
}

function link(overrides: Partial<ProcedureProfessionalLinkView> = {}): ProcedureProfessionalLinkView {
  return {
    colorToken: "azul",
    displayName: "Ana Ribeiro",
    durationOverrideMinutes: null,
    enabled: true,
    priceOverrideCents: null,
    professionalId: "professional-1",
    specialties: [],
    ...overrides,
  };
}

describe("cor de agenda", () => {
  it("resolve o token da paleta e cai na primeira cor quando desconhecido", () => {
    expect(agendaColor("verde").label).toBe("Verde");
    expect(agendaColor("cor-inexistente")).toEqual(AGENDA_COLORS[0]);
    // A paleta usa apenas tokens do design system — nada de cor crua.
    for (const color of AGENDA_COLORS) expect(color.cssValue).toMatch(/^var\(--stage-\d\)$/);
  });
});

describe("rótulos de situação", () => {
  it("descreve a situação em texto, com tom apenas como reforço", () => {
    expect(statusLabel("active")).toBe("Ativo");
    expect(statusLabel("inactive")).toBe("Inativo");
    expect(statusTone("active")).toBe("success");
    expect(statusTone("inactive")).toBe("neutral");
  });
});

describe("valor efetivo do vínculo profissional × procedimento", () => {
  it("herda o padrão do procedimento quando não há personalização", () => {
    expect(effectiveDurationMinutes(60, null)).toBe(60);
    expect(effectivePriceCents(25_000, null)).toBe(25_000);
    expect(hasDurationOverride(link())).toBe(false);
    expect(hasPriceOverride(link())).toBe(false);
    expect(hasAnyOverride(link())).toBe(false);
  });

  it("usa a personalização quando ela existe", () => {
    expect(effectiveDurationMinutes(60, 90)).toBe(90);
    expect(effectivePriceCents(25_000, 32_000)).toBe(32_000);
    expect(hasAnyOverride(link({ durationOverrideMinutes: 90 }))).toBe(true);
    expect(hasAnyOverride(link({ priceOverrideCents: 32_000 }))).toBe(true);
  });

  it("trata zero como personalização legítima, não como ausência", () => {
    expect(effectivePriceCents(25_000, 0)).toBe(0);
    expect(hasPriceOverride(link({ priceOverrideCents: 0 }))).toBe(true);
  });

  it("volta ao padrão quando a personalização é removida", () => {
    const customized = link({ durationOverrideMinutes: 90, priceOverrideCents: 32_000 });
    const cleared = { ...customized, durationOverrideMinutes: null, priceOverrideCents: null };
    expect(effectiveDurationMinutes(60, cleared.durationOverrideMinutes)).toBe(60);
    expect(effectivePriceCents(25_000, cleared.priceOverrideCents)).toBe(25_000);
    expect(hasAnyOverride(cleared)).toBe(false);
  });

  it("conta apenas os vínculos habilitados", () => {
    expect(countEnabledLinks([link(), link({ enabled: false, professionalId: "p2" })])).toBe(1);
  });
});

describe("filtros de profissionais", () => {
  const rows = [
    professional({ displayName: "Ana Ribeiro", id: "a", specialties: ["Harmonização facial"] }),
    professional({ displayName: "Bruno Lima", id: "b", specialties: ["Peeling"], status: "inactive" }),
    professional({ displayName: "Carla Souza", id: "c", linkedUserName: "carla@clinica", specialties: [] }),
  ];
  const base = { search: "", specialty: "", status: "all" } as const;

  it("sem filtros devolve todas as linhas", () => {
    expect(filterProfessionals(rows, base)).toHaveLength(3);
  });

  it("busca por nome ignorando acento e caixa", () => {
    expect(filterProfessionals(rows, { ...base, search: "ANA" }).map((row) => row.id)).toEqual(["a"]);
    expect(filterProfessionals(rows, { ...base, search: "harmonizacao" }).map((row) => row.id)).toEqual(["a"]);
    expect(filterProfessionals(rows, { ...base, search: "carla@" }).map((row) => row.id)).toEqual(["c"]);
    expect(filterProfessionals(rows, { ...base, search: "inexistente" })).toEqual([]);
  });

  it("filtra por situação e por especialidade, combinando com a busca", () => {
    expect(filterProfessionals(rows, { ...base, status: "inactive" }).map((row) => row.id)).toEqual(["b"]);
    expect(filterProfessionals(rows, { ...base, specialty: "Peeling" }).map((row) => row.id)).toEqual(["b"]);
    expect(filterProfessionals(rows, { search: "bruno", specialty: "Peeling", status: "active" })).toEqual([]);
  });

  it("reúne as especialidades distintas em ordem pt-BR", () => {
    expect(collectSpecialties(rows)).toEqual(["Harmonização facial", "Peeling"]);
  });
});

describe("filtros de procedimentos", () => {
  const rows = [
    procedure({ id: "a", name: "Limpeza de pele" }),
    procedure({ category: "Corporal", id: "b", name: "Massagem modeladora", status: "inactive" }),
    procedure({ category: null, id: "c", name: "Avaliação", basePriceCents: 0 }),
  ];
  const base = { category: "", search: "", status: "all" } as const;

  it("busca por nome e categoria ignorando acento", () => {
    expect(filterProcedures(rows, { ...base, search: "avaliacao" }).map((row) => row.id)).toEqual(["c"]);
    expect(filterProcedures(rows, { ...base, search: "corporal" }).map((row) => row.id)).toEqual(["b"]);
  });

  it("filtra por situação e categoria", () => {
    expect(filterProcedures(rows, { ...base, status: "active" }).map((row) => row.id)).toEqual(["a", "c"]);
    expect(filterProcedures(rows, { ...base, category: "Facial" }).map((row) => row.id)).toEqual(["a"]);
  });

  it("reúne as categorias distintas, ignorando procedimentos sem categoria", () => {
    expect(collectCategories(rows)).toEqual(["Corporal", "Facial"]);
  });
});

describe("contador de filtros ativos", () => {
  it("ignora a pesquisa e o valor padrão de situação", () => {
    expect(activeFilterCount({ status: "all" })).toBe(0);
    expect(activeFilterCount({ status: "active" })).toBe(1);
    expect(activeFilterCount({ specialty: "Peeling", status: "all" })).toBe(1);
    expect(activeFilterCount({ category: "Facial", status: "inactive" })).toBe(2);
  });
});
