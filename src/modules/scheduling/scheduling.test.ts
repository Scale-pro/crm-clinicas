import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/auth", () => ({ requireAal2: vi.fn(), requirePermission: vi.fn() }));
vi.mock("@/shared/db", () => ({ createServerSupabaseClient: vi.fn() }));

let api: typeof import("./index");

beforeAll(async () => {
  api = await import("./index");
});

const clinicId = "10000000-0000-4000-8000-000000000001";
const professionalId = "10000000-0000-4000-8000-000000000002";
const procedureId = "10000000-0000-4000-8000-000000000003";

describe("contratos públicos de scheduling", () => {
  it("mantém schemas strict e bloqueia mass assignment", () => {
    const professional = {
      clinicId,
      displayName: "Dra. Ana",
      email: "ANA@EXAMPLE.TEST",
      phone: "(11) 99876-5432",
      professionalRegistrationType: "CRM",
      professionalRegistrationNumber: "12345",
      color: "#aabbcc",
      notes: null,
      idempotencyKey: crypto.randomUUID(),
    };
    expect(api.createProfessionalSchema.parse(professional)).toMatchObject({
      color: "#AABBCC",
      email: "ana@example.test",
    });
    expect(api.createProfessionalSchema.safeParse({ ...professional, archivedAt: null }).success)
      .toBe(false);
    expect(api.createProcedureSchema.safeParse({
      clinicId,
      name: "Consulta",
      description: null,
      category: null,
      defaultDurationMinutes: 60,
      basePriceCents: 0,
      color: "#123456",
      idempotencyKey: crypto.randomUUID(),
      createdBy: clinicId,
    }).success).toBe(false);
  });

  it("valida preço, duração, versão, telefone e especialidades", () => {
    const baseProcedure = {
      clinicId,
      name: "Consulta",
      description: null,
      category: null,
      color: "#123456",
      idempotencyKey: crypto.randomUUID(),
    };
    expect(api.createProcedureSchema.safeParse({
      ...baseProcedure, defaultDurationMinutes: 5, basePriceCents: 0,
    }).success).toBe(true);
    expect(api.createProcedureSchema.safeParse({
      ...baseProcedure, defaultDurationMinutes: 4, basePriceCents: -1,
    }).success).toBe(false);
    expect(api.setProfessionalSpecialtiesSchema.safeParse({
      clinicId, professionalId, specialties: ["Dermatologia", " dermatologia "],
    }).success).toBe(false);
    expect(api.createProfessionalSchema.safeParse({
      clinicId, displayName: "Dra. Ana", email: null, phone: "123",
      professionalRegistrationType: null, professionalRegistrationNumber: null,
      color: "#123456", notes: null, idempotencyKey: crypto.randomUUID(),
    }).success).toBe(false);
  });

  it("calcula preço/duração efetivos e sinaliza overrides inclusive zero", () => {
    expect(api.effectiveDuration(60, null)).toEqual({
      defaultDurationMinutes: 60,
      effectiveDurationMinutes: 60,
      hasDurationOverride: false,
    });
    expect(api.effectiveDuration(60, 45).effectiveDurationMinutes).toBe(45);
    expect(api.effectivePrice(10_000, null)).toEqual({
      basePriceCents: 10_000,
      effectivePriceCents: 10_000,
      hasPriceOverride: false,
    });
    expect(api.effectivePrice(10_000, 0)).toMatchObject({
      effectivePriceCents: 0,
      hasPriceOverride: true,
    });
    expect(api.setProfessionalProcedureSchema.safeParse({
      clinicId,
      professionalId,
      procedureId,
      durationMinutesOverride: null,
      priceCentsOverride: 0,
      expectedVersion: null,
    }).success).toBe(true);
    expect(api.setProfessionalProcedureSchema.safeParse({
      clinicId,
      professionalId,
      procedureId,
      durationMinutesOverride: null,
      priceCentsOverride: null,
    }).success).toBe(false);
  });

  it("ordena disponibilidade e aceita adjacência, rejeitando overlap", () => {
    const intervals = [
      { weekday: 2, startMinute: 600, endMinute: 720 },
      { weekday: 1, startMinute: 780, endMinute: 900 },
      { weekday: 1, startMinute: 480, endMinute: 780 },
    ];
    expect(api.sortWeeklyAvailability(intervals)).toEqual([
      intervals[2], intervals[1], intervals[0],
    ]);
    expect(api.setProfessionalWeeklyAvailabilitySchema.safeParse({
      clinicId, professionalId, intervals, expectedVersion: 1,
    }).success).toBe(true);
    expect(api.setProfessionalWeeklyAvailabilitySchema.safeParse({
      clinicId, professionalId, intervals: [
        { weekday: 1, startMinute: 480, endMinute: 780 },
        { weekday: 1, startMinute: 779, endMinute: 900 },
      ], expectedVersion: 1,
    }).success).toBe(false);
    expect(api.setProfessionalWeeklyAvailabilitySchema.safeParse({
      clinicId, professionalId, intervals,
    }).success).toBe(false);
  });

  it("valida paginação/filtros e mapeia somente códigos controlados", () => {
    expect(api.listProfessionalProceduresSchema.safeParse({
      clinicId, professionalId, procedureId, page: 1, pageSize: 100,
    }).success).toBe(true);
    expect(api.listProfessionalProceduresSchema.safeParse({
      clinicId, professionalId, procedureId, page: 0, pageSize: 101,
    }).success).toBe(false);
    expect(api.mapSchedulingError({ code: "P4307" })).toBe("procedure_name_conflict");
    expect(api.mapSchedulingError({ code: "P4309" })).toBe("availability_overlap");
    expect(api.mapSchedulingError({ code: "23505" })).toBe("unavailable");
  });
});
