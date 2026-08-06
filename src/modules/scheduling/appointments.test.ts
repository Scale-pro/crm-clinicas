import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/auth", () => ({ requireAal2: vi.fn(), requirePermission: vi.fn() }));
vi.mock("@/shared/db", () => ({ createServerSupabaseClient: vi.fn() }));

let api: typeof import("./index");

beforeAll(async () => {
  api = await import("./index");
});

const clinicId = "10000000-0000-4000-8000-000000000001";
const contactId = "10000000-0000-4000-8000-000000000002";
const professionalId = "10000000-0000-4000-8000-000000000003";
const procedureId = "10000000-0000-4000-8000-000000000004";
const appointmentId = "10000000-0000-4000-8000-000000000005";

function validCreation() {
  return {
    clinicId,
    contactId,
    professionalId,
    procedureId,
    customProcedureName: null,
    startAt: "2026-08-05T14:00:00.000Z",
    durationMinutes: 60,
    priceCents: 25_000,
    notes: null,
    idempotencyKey: crypto.randomUUID(),
  };
}

describe("contratos públicos de agendamentos (F4)", () => {
  it("aceita agendamento de catálogo e preenche defaults nulos", () => {
    const parsed = api.createAppointmentSchema.parse({
      ...validCreation(),
      durationMinutes: null,
      priceCents: null,
    });
    expect(parsed.durationMinutes).toBeNull();
    expect(parsed.priceCents).toBeNull();
    expect(parsed.customProcedureName).toBeNull();
  });

  it("exige exatamente uma origem de procedimento", () => {
    expect(api.createAppointmentSchema.safeParse({
      ...validCreation(),
      customProcedureName: "Limpeza de pele",
    }).success).toBe(false);
    expect(api.createAppointmentSchema.safeParse({
      ...validCreation(),
      procedureId: null,
    }).success).toBe(false);
  });

  it("procedimento livre exige duração e preço explícitos", () => {
    const custom = {
      ...validCreation(),
      procedureId: null,
      customProcedureName: "Limpeza de pele",
    };
    expect(api.createAppointmentSchema.safeParse(custom).success).toBe(true);
    expect(api.createAppointmentSchema.safeParse({
      ...custom,
      priceCents: null,
    }).success).toBe(false);
    expect(api.createAppointmentSchema.safeParse({
      ...custom,
      durationMinutes: null,
    }).success).toBe(false);
  });

  it("é strict contra mass assignment", () => {
    expect(api.createAppointmentSchema.safeParse({
      ...validCreation(),
      status: "paid",
    }).success).toBe(false);
    expect(api.updateAppointmentStatusSchema.safeParse({
      clinicId,
      appointmentId,
      status: "paid",
      expectedVersion: 1,
      priceCents: 0,
    }).success).toBe(false);
  });

  it("limita o intervalo de listagem a 62 dias com fim após o início", () => {
    const base = {
      clinicId,
      professionalId: null,
      contactId: null,
      status: null,
      page: 1,
      pageSize: 500,
    };
    expect(api.listAppointmentsSchema.safeParse({
      ...base,
      from: "2026-08-05T00:00:00.000Z",
      to: "2026-08-06T00:00:00.000Z",
    }).success).toBe(true);
    expect(api.listAppointmentsSchema.safeParse({
      ...base,
      from: "2026-08-05T00:00:00.000Z",
      to: "2026-08-05T00:00:00.000Z",
    }).success).toBe(false);
    expect(api.listAppointmentsSchema.safeParse({
      ...base,
      from: "2026-08-05T00:00:00.000Z",
      to: "2026-11-05T00:00:00.000Z",
    }).success).toBe(false);
  });

  it("só aceita status do vocabulário do domínio", () => {
    for (const status of api.APPOINTMENT_STATUSES) {
      expect(api.updateAppointmentStatusSchema.safeParse({
        clinicId,
        appointmentId,
        status,
        expectedVersion: 3,
      }).success).toBe(true);
    }
    expect(api.updateAppointmentStatusSchema.safeParse({
      clinicId,
      appointmentId,
      status: "Pago",
      expectedVersion: 3,
    }).success).toBe(false);
  });

  it("mapeia os novos SQLSTATEs da agenda para o vocabulário do módulo", () => {
    expect(api.mapSchedulingError({ code: "P4311" })).toBe("appointment_not_found");
    expect(api.mapSchedulingError({ code: "P4312" })).toBe("appointment_canceled");
    expect(api.mapSchedulingError({ code: "P4313" })).toBe("appointment_overlap");
    expect(api.mapSchedulingError({ code: "P4315" })).toBe("appointment_contact_not_found");
  });
});
