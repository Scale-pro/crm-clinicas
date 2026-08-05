import { describe, expect, it } from "vitest";

import type { AppointmentStatus } from "@/modules/scheduling";

import {
  availableSlots,
  formatMinutesAsTime,
  gridBounds,
  groupByProfessional,
  hourlySeries,
  minutesIntoDay,
  performanceByProfessional,
  placeAppointments,
  shiftDayKey,
  summarizeDay,
  upcomingAppointments,
  zonedDayKey,
  zonedDayRange,
  zonedDayStart,
  zonedTimeToInstant,
  type AgendaAppointment,
} from "./agenda-view-model";

const SAO_PAULO = "America/Sao_Paulo";

function appointment(overrides: Partial<AgendaAppointment> & { id: string }): AgendaAppointment {
  return {
    contactId: "contact",
    contactName: "Maria Silva",
    professionalId: "prof-1",
    professionalName: "Dra. Ana",
    professionalColor: "#2563EB",
    procedureName: "Limpeza de pele",
    startAt: "2026-08-05T12:00:00.000Z",
    durationMinutes: 60,
    priceCents: 25_000,
    status: "confirmed" as AppointmentStatus,
    notes: null,
    version: 1,
    ...overrides,
  };
}

describe("fuso da clínica", () => {
  it("resolve a meia-noite local como instante UTC", () => {
    expect(zonedDayStart("2026-08-05", SAO_PAULO).toISOString())
      .toBe("2026-08-05T03:00:00.000Z");
    expect(zonedDayStart("2026-08-05", "UTC").toISOString())
      .toBe("2026-08-05T00:00:00.000Z");
  });

  it("descobre o dia civil da clínica, não o do servidor", () => {
    // 02:30 UTC de 6/8 ainda é 23:30 de 5/8 em São Paulo.
    expect(zonedDayKey("2026-08-06T02:30:00.000Z", SAO_PAULO)).toBe("2026-08-05");
    expect(zonedDayKey("2026-08-06T02:30:00.000Z", "UTC")).toBe("2026-08-06");
  });

  it("produz intervalos fechados à esquerda cobrindo o dia inteiro", () => {
    expect(zonedDayRange("2026-08-05", SAO_PAULO)).toEqual({
      from: "2026-08-05T03:00:00.000Z",
      to: "2026-08-06T03:00:00.000Z",
    });
    expect(zonedDayRange("2026-08-05", SAO_PAULO, 7).to).toBe("2026-08-12T03:00:00.000Z");
  });

  it("converte horário local em instante e volta ao mesmo minuto", () => {
    const instant = zonedTimeToInstant("2026-08-05", "14:30", SAO_PAULO);
    expect(instant).toBe("2026-08-05T17:30:00.000Z");
    expect(minutesIntoDay(instant, zonedDayStart("2026-08-05", SAO_PAULO)))
      .toBe(14 * 60 + 30);
  });

  it("anda no calendário sem depender de fuso", () => {
    expect(shiftDayKey("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftDayKey("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("formata minutos como horário de parede", () => {
    expect(formatMinutesAsTime(0)).toBe("00:00");
    expect(formatMinutesAsTime(9 * 60 + 5)).toBe("09:05");
    expect(formatMinutesAsTime(23 * 60 + 59)).toBe("23:59");
  });
});

describe("grade da agenda", () => {
  const dayStart = zonedDayStart("2026-08-05", SAO_PAULO);

  it("usa o expediente padrão quando não há nada fora dele", () => {
    expect(gridBounds([appointment({ id: "a" })], dayStart))
      .toEqual({ startHour: 8, endHour: 19 });
  });

  it("estende a faixa para nunca esconder um horário excepcional", () => {
    const early = appointment({ id: "a", startAt: "2026-08-05T09:00:00.000Z" }); // 06:00 local
    const late = appointment({
      id: "b",
      startAt: "2026-08-05T24:00:00.000Z".replace("24", "23"),
      durationMinutes: 90,
    });
    const bounds = gridBounds([early, late], dayStart);
    expect(bounds.startHour).toBe(6);
    expect(bounds.endHour).toBeGreaterThanOrEqual(21);
  });

  it("ignora cancelados ao dimensionar e ao posicionar", () => {
    const canceled = appointment({
      id: "x",
      startAt: "2026-08-05T09:00:00.000Z",
      status: "canceled",
    });
    expect(gridBounds([canceled], dayStart)).toEqual({ startHour: 8, endHour: 19 });
    expect(placeAppointments([canceled], dayStart, { startHour: 8, endHour: 19 }))
      .toHaveLength(0);
  });

  it("posiciona proporcionalmente à faixa visível", () => {
    const bounds = { startHour: 8, endHour: 18 } as const;
    // 12:00Z = 09:00 local: uma hora após o início de uma faixa de dez horas.
    const [placed] = placeAppointments([appointment({ id: "a" })], dayStart, bounds);
    expect(placed!.top).toBeCloseTo(1 / 10);
    expect(placed!.height).toBeCloseTo(1 / 10);
    expect(placed!.timeLabel).toBe("09:00");
    expect(placed!.endLabel).toBe("10:00");
  });

  it("recorta quem transborda a faixa em vez de estourar a grade", () => {
    const bounds = { startHour: 8, endHour: 10 } as const;
    const long = appointment({ id: "a", durationMinutes: 240 }); // 09:00 → 13:00
    const [placed] = placeAppointments([long], dayStart, bounds);
    expect(placed!.top + placed!.height).toBeLessThanOrEqual(1);
    expect(placed!.endLabel).toBe("13:00");
  });

  it("agrupa por profissional preservando a ordem das colunas", () => {
    const grouped = groupByProfessional(
      [{ id: "prof-2" }, { id: "prof-1" }],
      [
        appointment({ id: "a", professionalId: "prof-1" }),
        appointment({ id: "b", professionalId: "prof-2" }),
      ],
    );
    expect(grouped.map((column) => column.professional.id)).toEqual(["prof-2", "prof-1"]);
    expect(grouped[0]!.appointments.map((item) => item.id)).toEqual(["b"]);
  });
});

describe("resumos do dia", () => {
  const now = new Date("2026-08-05T20:00:00.000Z"); // 17:00 local

  it("separa previsto, recebido e pendente sem inventar zeros", () => {
    const summary = summarizeDay([
      appointment({ id: "a", priceCents: 25_000, status: "paid" }),
      appointment({ id: "b", priceCents: 15_000, status: "confirmed" }),
      appointment({ id: "c", priceCents: 90_000, status: "canceled" }),
    ], now);
    expect(summary).toMatchObject({
      total: 2,
      canceled: 1,
      expectedCents: 40_000,
      settledCents: 25_000,
      pendingCents: 15_000,
    });
  });

  it("conta como atenção o que já terminou e segue sem pagamento", () => {
    const summary = summarizeDay([
      appointment({ id: "a", startAt: "2026-08-05T12:00:00.000Z", status: "confirmed" }),
      appointment({ id: "b", startAt: "2026-08-05T12:00:00.000Z", status: "paid" }),
      appointment({ id: "c", startAt: "2026-08-05T22:00:00.000Z", status: "confirmed" }),
    ], now);
    expect(summary.needsAttention).toBe(1);
  });

  it("distribui a série horária dentro da faixa visível", () => {
    const dayStart = zonedDayStart("2026-08-05", SAO_PAULO);
    const series = hourlySeries(
      [
        appointment({ id: "a", status: "paid", priceCents: 25_000 }), // 09:00
        appointment({ id: "b", startAt: "2026-08-05T13:00:00.000Z" }), // 10:00
      ],
      dayStart,
      { startHour: 8, endHour: 11 },
    );
    expect(series.map((point) => point.label)).toEqual(["08h", "09h", "10h"]);
    expect(series.map((point) => point.appointments)).toEqual([0, 1, 1]);
    expect(series[1]!.settledCents).toBe(25_000);
  });

  it("ordena o desempenho por valor recebido", () => {
    const rows = performanceByProfessional([
      appointment({ id: "a", professionalId: "p1", professionalName: "Ana", priceCents: 10_000 }),
      appointment({
        id: "b",
        professionalId: "p2",
        professionalName: "Bruno",
        priceCents: 30_000,
        status: "paid",
      }),
      appointment({ id: "c", professionalId: "p3", status: "canceled" }),
    ]);
    expect(rows.map((row) => row.professionalId)).toEqual(["p2", "p1"]);
    expect(rows[0]!.settledCents).toBe(30_000);
    expect(rows[1]!.expectedCents).toBe(10_000);
  });

  it("lista os próximos incluindo o que está em andamento", () => {
    const upcoming = upcomingAppointments([
      appointment({ id: "passado", startAt: "2026-08-05T10:00:00.000Z" }),
      appointment({ id: "agora", startAt: "2026-08-05T19:30:00.000Z" }),
      appointment({ id: "depois", startAt: "2026-08-05T21:00:00.000Z" }),
      appointment({ id: "cancelado", startAt: "2026-08-05T21:30:00.000Z", status: "canceled" }),
    ], now);
    expect(upcoming.map((item) => item.id)).toEqual(["agora", "depois"]);
  });
});

describe("horários livres", () => {
  const dayStart = zonedDayStart("2026-08-05", SAO_PAULO);
  const bounds = { startHour: 9, endHour: 12 } as const;

  it("remove os horários que colidem com o que já está marcado", () => {
    const slots = availableSlots(
      [appointment({ id: "a", startAt: "2026-08-05T13:00:00.000Z", durationMinutes: 60 })],
      dayStart,
      bounds,
      60,
    );
    expect(slots).toEqual(["09:00", "11:00"]);
  });

  it("não oferece horário que ultrapasse o fim da faixa", () => {
    const slots = availableSlots([], dayStart, bounds, 90);
    expect(slots.at(-1)).toBe("10:30");
  });

  it("ignora cancelados ao calcular disponibilidade", () => {
    const slots = availableSlots(
      [appointment({ id: "a", startAt: "2026-08-05T12:00:00.000Z", status: "canceled" })],
      dayStart,
      bounds,
      60,
    );
    expect(slots).toContain("09:00");
  });
});
