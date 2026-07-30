import { describe, expect, it } from "vitest";

import {
  BUSINESS_DAY_KEYS,
  MAX_SPECIALTIES,
  addSpecialty,
  activeDayCount,
  copyDayTo,
  dayMinutes,
  emptyWeek,
  findOverlappingRangeIds,
  formatMinutesAsTime,
  hasSpecialty,
  normalizeSpecialty,
  parseTimeToMinutes,
  rangesOverlap,
  removeSpecialty,
  sortRanges,
  summarizeDay,
  summarizeWeek,
  summarizeWeekdays,
  validateDay,
  validateProcedureForm,
  validateProfessionalForm,
  validateRange,
  validateWeek,
  weeklyMinutes,
  type DayAvailabilityDraft,
  type ProcedureFormValues,
  type ProfessionalFormValues,
  type TimeRangeDraft,
  type WeekdayKey,
  type WeeklyAvailabilityDraft,
} from "./operations-validation";

function range(id: string, start: string, end: string): TimeRangeDraft {
  return { end, id, start };
}

function day(ranges: readonly TimeRangeDraft[], enabled = true): DayAvailabilityDraft {
  return { enabled, ranges };
}

function week(overrides: Partial<Record<WeekdayKey, DayAvailabilityDraft>>): WeeklyAvailabilityDraft {
  return { ...emptyWeek(), ...overrides };
}

function professional(overrides: Partial<ProfessionalFormValues> = {}): ProfessionalFormValues {
  return {
    availability: emptyWeek(),
    colorToken: "azul",
    displayName: "Ana Ribeiro",
    email: "",
    linkedUserId: null,
    notes: "",
    phone: "",
    registrationNumber: "",
    registrationType: "",
    specialties: [],
    status: "active",
    ...overrides,
  };
}

function procedure(overrides: Partial<ProcedureFormValues> = {}): ProcedureFormValues {
  return {
    basePriceCents: 25_000,
    category: "Facial",
    colorToken: "azul",
    description: "",
    durationMinutes: 60,
    name: "Limpeza de pele",
    status: "active",
    ...overrides,
  };
}

describe("horários e intervalos", () => {
  it("lê e escreve horários locais sem inventar fuso", () => {
    expect(parseTimeToMinutes("08:30")).toBe(510);
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("23:59")).toBe(1439);
    expect(parseTimeToMinutes("24:00")).toBeNull();
    expect(parseTimeToMinutes("08:60")).toBeNull();
    expect(parseTimeToMinutes("oito")).toBeNull();
    expect(formatMinutesAsTime(510)).toBe("08:30");
    expect(formatMinutesAsTime(0)).toBe("00:00");
  });

  it("ordena intervalos por início e depois por fim", () => {
    const sorted = sortRanges([
      range("c", "13:00", "18:00"),
      range("a", "08:00", "12:00"),
      range("b", "08:00", "09:00"),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["b", "a", "c"]);
  });

  it("rejeita fim igual ou anterior ao início e formato inválido", () => {
    expect(validateRange(range("a", "08:00", "12:00"))).toBeNull();
    expect(validateRange(range("a", "12:00", "12:00"))).toBe("end_not_after_start");
    expect(validateRange(range("a", "18:00", "09:00"))).toBe("end_not_after_start");
    expect(validateRange(range("a", "", "12:00"))).toBe("invalid_time");
  });

  it("não permite intervalo atravessando a meia-noite", () => {
    // 22:00–02:00 seria "fim antes do início" — nada é convertido para o dia seguinte.
    expect(validateRange(range("a", "22:00", "02:00"))).toBe("end_not_after_start");
    expect(validateRange(range("a", "22:00", "23:59"))).toBeNull();
  });

  it("aceita intervalos adjacentes e rejeita sobreposição", () => {
    const adjacent = [range("a", "08:00", "12:00"), range("b", "12:00", "18:00")];
    expect(rangesOverlap(adjacent[0]!, adjacent[1]!)).toBe(false);
    expect(findOverlappingRangeIds(adjacent)).toEqual([]);
    expect(validateDay("monday", day(adjacent))).toEqual([]);

    const overlapping = [range("a", "08:00", "13:00"), range("b", "12:00", "18:00")];
    expect(rangesOverlap(overlapping[0]!, overlapping[1]!)).toBe(true);
    expect([...findOverlappingRangeIds(overlapping)].sort()).toEqual(["a", "b"]);
    const issues = validateDay("monday", day(overlapping));
    expect(issues).toHaveLength(2);
    expect(issues.every((issue) => issue.code === "overlap")).toBe(true);
    expect(issues[0]!.message).toContain("sobrepõe");
  });

  it("detecta sobreposição por contenção total", () => {
    const contained = [range("a", "08:00", "18:00"), range("b", "10:00", "11:00")];
    expect([...findOverlappingRangeIds(contained)].sort()).toEqual(["a", "b"]);
  });

  it("ignora dias desativados na validação", () => {
    expect(validateDay("monday", day([range("a", "18:00", "09:00")], false))).toEqual([]);
  });
});

describe("carga semanal", () => {
  it("soma os minutos dos intervalos válidos do dia", () => {
    expect(dayMinutes(day([range("a", "08:00", "12:00"), range("b", "13:00", "18:00")]))).toBe(540);
    expect(dayMinutes(day([range("a", "08:00", "12:00")], false))).toBe(0);
    // Intervalo inválido não entra na conta — não vira duração negativa.
    expect(dayMinutes(day([range("a", "18:00", "09:00")]))).toBe(0);
  });

  it("soma a semana e conta apenas os dias com horário efetivo", () => {
    const full = week(Object.fromEntries(
      BUSINESS_DAY_KEYS.map((key) => [key, day([range(`${key}-1`, "09:00", "18:00")])]),
    ));
    expect(weeklyMinutes(full)).toBe(5 * 540);
    expect(activeDayCount(full)).toBe(5);
    expect(summarizeWeek(full)).toBe("5 dias • 45h por semana");
    expect(summarizeWeekdays(full)).toBe("Seg, Ter, Qua, Qui, Sex");

    // Dia ativado mas sem intervalo não conta como dia de atendimento.
    const empty = week({ monday: day([], true) });
    expect(weeklyMinutes(empty)).toBe(0);
    expect(activeDayCount(empty)).toBe(0);
    expect(summarizeWeek(empty)).toBe("Nenhum horário definido");
    expect(summarizeWeekdays(empty)).toBe("Sem horários");
  });

  it("resume o dia em texto legível", () => {
    expect(summarizeDay(day([range("b", "13:00", "18:00"), range("a", "08:00", "12:00")])))
      .toBe("08:00–12:00, 13:00–18:00");
    expect(summarizeDay(day([], false))).toBe("Sem atendimento");
    expect(summarizeDay(day([], true))).toBe("Sem horários definidos");
  });

  it("copia horários para outros dias gerando novos identificadores", () => {
    const source = week({ monday: day([range("m1", "09:00", "18:00")]) });
    const copied = copyDayTo(source, "monday", BUSINESS_DAY_KEYS, (weekday, index) => `${weekday}-${index}`);
    expect(activeDayCount(copied)).toBe(5);
    expect(copied.friday.ranges[0]!.start).toBe("09:00");
    expect(copied.friday.ranges[0]!.id).toBe("friday-0");
    // A origem é preservada, com o identificador original.
    expect(copied.monday.ranges[0]!.id).toBe("m1");
    expect(copied.sunday.enabled).toBe(false);
  });

  it("a semana vazia é válida e não gera nenhum problema", () => {
    expect(validateWeek(emptyWeek())).toEqual([]);
    expect(weeklyMinutes(emptyWeek())).toBe(0);
  });
});

describe("especialidades", () => {
  it("apara o texto e preserva a caixa digitada", () => {
    expect(normalizeSpecialty("  Harmonização   facial  ")).toBe("Harmonização facial");
    const result = addSpecialty([], "  Botox  ");
    expect(result.status).toBe("added");
    expect(result.specialties).toEqual(["Botox"]);
  });

  it("recusa duplicata ignorando caixa e acento", () => {
    expect(hasSpecialty(["Harmonização facial"], "harmonizacao FACIAL")).toBe(true);
    const result = addSpecialty(["Botox"], "botox");
    expect(result.status).toBe("duplicate");
    expect(result.specialties).toEqual(["Botox"]);
    expect(result.message).toBe("Esta especialidade já está na lista.");
  });

  it("recusa vazio, texto longo demais e estouro do limite", () => {
    expect(addSpecialty([], "   ").status).toBe("empty");
    expect(addSpecialty([], "x".repeat(41)).status).toBe("too_long");
    const full = Array.from({ length: MAX_SPECIALTIES }, (_, index) => `Especialidade ${index}`);
    const result = addSpecialty(full, "Mais uma");
    expect(result.status).toBe("limit_reached");
    expect(result.specialties).toHaveLength(MAX_SPECIALTIES);
  });

  it("remove ignorando caixa e acento", () => {
    expect(removeSpecialty(["Botox", "Peeling"], "BOTOX")).toEqual(["Peeling"]);
  });
});

describe("formulário de profissional", () => {
  it("aceita profissional sem e-mail, sem telefone e sem conta vinculada", () => {
    expect(validateProfessionalForm(professional())).toEqual({});
  });

  it("exige nome de exibição com conteúdo real", () => {
    expect(validateProfessionalForm(professional({ displayName: " A " })).displayName).toBeDefined();
    expect(validateProfessionalForm(professional({ displayName: "  " })).displayName).toBeDefined();
    expect(validateProfessionalForm(professional({ displayName: "x".repeat(81) })).displayName).toBeDefined();
  });

  it("valida e-mail e telefone somente quando preenchidos", () => {
    expect(validateProfessionalForm(professional({ email: "sem-arroba" })).email).toBeDefined();
    expect(validateProfessionalForm(professional({ email: "ana@clinica.com.br" })).email).toBeUndefined();
    expect(validateProfessionalForm(professional({ phone: "119" })).phone).toBeDefined();
    expect(validateProfessionalForm(professional({ phone: "11912345678" })).phone).toBeUndefined();
  });

  it("bloqueia o envio quando a disponibilidade tem sobreposição", () => {
    const overlapping = week({
      monday: day([range("a", "08:00", "13:00"), range("b", "12:00", "18:00")]),
    });
    const errors = validateProfessionalForm(professional({ availability: overlapping }));
    expect(errors.availability).toBeDefined();

    const adjacent = week({
      monday: day([range("a", "08:00", "12:00"), range("b", "12:00", "18:00")]),
    });
    expect(validateProfessionalForm(professional({ availability: adjacent })).availability).toBeUndefined();
  });
});

describe("formulário de procedimento", () => {
  it("aceita um procedimento completo", () => {
    expect(validateProcedureForm(procedure())).toEqual({});
  });

  it("aceita preço zero como valor legítimo", () => {
    expect(validateProcedureForm(procedure({ basePriceCents: 0 })).basePriceCents).toBeUndefined();
  });

  it("recusa preço ausente e preço negativo", () => {
    expect(validateProcedureForm(procedure({ basePriceCents: null })).basePriceCents).toBeDefined();
    expect(validateProcedureForm(procedure({ basePriceCents: -1 })).basePriceCents)
      .toBe("O preço não pode ser negativo.");
  });

  it("recusa duração ausente, curta demais ou acima de 24 horas", () => {
    expect(validateProcedureForm(procedure({ durationMinutes: null })).durationMinutes).toBeDefined();
    expect(validateProcedureForm(procedure({ durationMinutes: 0 })).durationMinutes).toBeDefined();
    expect(validateProcedureForm(procedure({ durationMinutes: 4 })).durationMinutes).toBeDefined();
    expect(validateProcedureForm(procedure({ durationMinutes: 1441 })).durationMinutes).toBeDefined();
    expect(validateProcedureForm(procedure({ durationMinutes: 5 })).durationMinutes).toBeUndefined();
  });

  it("limita nome, categoria e descrição", () => {
    expect(validateProcedureForm(procedure({ name: "A" })).name).toBeDefined();
    expect(validateProcedureForm(procedure({ category: "c".repeat(41) })).category).toBeDefined();
    expect(validateProcedureForm(procedure({ description: "d".repeat(501) })).description).toBeDefined();
  });
});
