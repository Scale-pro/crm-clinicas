import { describe, expect, it } from "vitest";

import { agendaColorToHex } from "./agenda-color";
import {
  availabilityDraftFromIntervals,
  intervalsFromAvailabilityDraft,
  isoFromWeekdayKey,
  nationalPhoneDigits,
  operationsStatus,
  procedureSummaryFromRow,
  professionalSummaryFromRow,
  sameIntervals,
  weekdayKeyFromIso,
} from "./operations-adapters";
import { emptyWeek, summarizeWeek, type WeeklyAvailabilityDraft } from "./operations-validation";

const week = (partial: Partial<WeeklyAvailabilityDraft>): WeeklyAvailabilityDraft => ({
  ...emptyWeek(),
  ...partial,
});

describe("dias da semana entre interface e banco", () => {
  it("segue ISO-8601: 1 é segunda-feira e 7 é domingo", () => {
    expect(weekdayKeyFromIso(1)).toBe("monday");
    expect(weekdayKeyFromIso(7)).toBe("sunday");
    expect(isoFromWeekdayKey("monday")).toBe(1);
    expect(isoFromWeekdayKey("sunday")).toBe(7);
  });

  it("dia fora da faixa não vira um dia qualquer", () => {
    expect(weekdayKeyFromIso(0)).toBeNull();
    expect(weekdayKeyFromIso(8)).toBeNull();
  });
});

describe("disponibilidade semanal — ida e volta", () => {
  it("intervalos do banco viram rascunho com horários legíveis", () => {
    const draft = availabilityDraftFromIntervals([
      { endMinute: 720, startMinute: 480, weekday: 1 },
      { endMinute: 1080, startMinute: 780, weekday: 1 },
      { endMinute: 1020, startMinute: 540, weekday: 6 },
    ]);
    expect(draft.monday.enabled).toBe(true);
    expect(draft.monday.ranges.map((range) => `${range.start}–${range.end}`))
      .toEqual(["08:00–12:00", "13:00–18:00"]);
    expect(draft.saturday.ranges).toHaveLength(1);
    // Dia sem intervalo é dia sem atendimento, não dia vazio habilitado.
    expect(draft.tuesday.enabled).toBe(false);
    expect(draft.sunday.ranges).toEqual([]);
    // Segunda 4h + 5h, sábado 8h.
    expect(summarizeWeek(draft)).toBe("2 dias • 17h por semana");
  });

  it("cada intervalo recebe um identificador próprio dentro do dia", () => {
    const draft = availabilityDraftFromIntervals([
      { endMinute: 720, startMinute: 480, weekday: 1 },
      { endMinute: 1080, startMinute: 780, weekday: 1 },
    ]);
    const ids = draft.monday.ranges.map((range) => range.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("o rascunho volta a virar intervalos ISO com minutos do dia", () => {
    const draft = week({
      monday: { enabled: true, ranges: [{ end: "12:00", id: "a", start: "08:00" }] },
      sunday: { enabled: true, ranges: [{ end: "16:30", id: "b", start: "09:00" }] },
    });
    expect(intervalsFromAvailabilityDraft(draft)).toEqual([
      { endMinute: 720, startMinute: 480, weekday: 1 },
      { endMinute: 990, startMinute: 540, weekday: 7 },
    ]);
  });

  it("dia desabilitado não produz intervalo, mesmo com horários preenchidos", () => {
    const draft = week({
      monday: { enabled: false, ranges: [{ end: "12:00", id: "a", start: "08:00" }] },
    });
    expect(intervalsFromAvailabilityDraft(draft)).toEqual([]);
  });

  it("recusa a semana inteira quando há intervalo inválido — nunca descarta em silêncio", () => {
    const invalid = week({
      monday: { enabled: true, ranges: [{ end: "07:00", id: "a", start: "08:00" }] },
    });
    expect(intervalsFromAvailabilityDraft(invalid)).toBeNull();

    const malformed = week({
      tuesday: { enabled: true, ranges: [{ end: "", id: "b", start: "08:00" }] },
    });
    expect(intervalsFromAvailabilityDraft(malformed)).toBeNull();
  });

  it("compara semanas ignorando a ordem dos intervalos", () => {
    const left = [
      { endMinute: 720, startMinute: 480, weekday: 1 },
      { endMinute: 1080, startMinute: 780, weekday: 1 },
    ];
    expect(sameIntervals(left, [...left].reverse())).toBe(true);
    expect(sameIntervals(left, [left[0]!])).toBe(false);
    expect(sameIntervals([], [])).toBe(true);
  });

  it("ida e volta preserva o conteúdo da semana", () => {
    const intervals = [
      { endMinute: 720, startMinute: 480, weekday: 2 },
      { endMinute: 1020, startMinute: 600, weekday: 5 },
    ];
    const roundTrip = intervalsFromAvailabilityDraft(availabilityDraftFromIntervals(intervals));
    expect(sameIntervals(roundTrip!, intervals)).toBe(true);
  });
});

describe("telefone na fronteira", () => {
  it("remove o prefixo do país guardado em E.164", () => {
    expect(nationalPhoneDigits("+5511987654321")).toBe("11987654321");
    expect(nationalPhoneDigits("+551133334444")).toBe("1133334444");
  });

  it("não mutila número guardado em outro formato", () => {
    expect(nationalPhoneDigits("11987654321")).toBe("11987654321");
    expect(nationalPhoneDigits("5511")).toBe("5511");
    expect(nationalPhoneDigits(null)).toBe("");
  });
});

describe("linhas de listagem", () => {
  it("profissional: converte cor e situação e não inventa o que a listagem não traz", () => {
    const row = professionalSummaryFromRow({
      color: agendaColorToHex("verde"),
      displayName: "Ana Ribeiro",
      id: "11111111-1111-4111-8111-111111111111",
      specialties: ["Peeling"],
      status: "active",
    });
    expect(row.colorToken).toBe("verde");
    expect(row.status).toBe("active");
    expect(row.href).toContain("/app/settings/professionals/");
    // Ausente é diferente de "não tem": estes dados só existem no detalhe.
    expect(row.linkedUserName).toBeUndefined();
    expect(row.weekdaysLabel).toBeUndefined();
    expect(row.enabledProcedureCount).toBeUndefined();
  });

  it("procedimento: preserva preço zero e não conta vínculos que não recebeu", () => {
    const row = procedureSummaryFromRow({
      basePriceCents: 0,
      category: null,
      color: "#000000",
      defaultDurationMinutes: 30,
      id: "22222222-2222-4222-8222-222222222222",
      name: "Avaliação",
      status: "inactive",
    });
    expect(row.basePriceCents).toBe(0);
    expect(row.durationMinutes).toBe(30);
    expect(row.status).toBe("inactive");
    // Cor fora da paleta cai no token padrão, sem quebrar a listagem.
    expect(row.colorToken).toBe("azul");
    expect(row.enabledProfessionalCount).toBeUndefined();
  });

  it("qualquer situação desconhecida é tratada como inativa", () => {
    expect(operationsStatus("active")).toBe("active");
    expect(operationsStatus("archived")).toBe("inactive");
    expect(operationsStatus("")).toBe("inactive");
  });
});
