import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/auth", () => ({ requireAal2: vi.fn(), requirePermission: vi.fn() }));
vi.mock("@/shared/db", () => ({ createServerSupabaseClient: vi.fn() }));

let opportunitiesModule: typeof import("./opportunities");
let requirePermission: ReturnType<typeof vi.fn>;
let createServerSupabaseClient: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  opportunitiesModule = await import("./opportunities");
  requirePermission = vi.mocked((await import("@/shared/auth")).requirePermission);
  createServerSupabaseClient = vi.mocked((await import("@/shared/db")).createServerSupabaseClient);
});

beforeEach(() => vi.clearAllMocks());

describe("contratos de oportunidades", () => {
  it("valida amount_cents, expected_version e mass assignment", () => {
    const base = {
      amountCents: 12500,
      clinicId: crypto.randomUUID(),
      confirmedExistingOpen: false,
      contactId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      initialSourceId: null,
      title: "Avaliação fictícia",
    };
    expect(opportunitiesModule.createOpportunitySchema.safeParse(base).success).toBe(true);
    expect(opportunitiesModule.createOpportunitySchema.safeParse({ ...base, amountCents: -1 }).success).toBe(false);
    expect(opportunitiesModule.createOpportunitySchema.safeParse({ ...base, assignedToUserId: crypto.randomUUID() }).success).toBe(false);
    const update = {
      amountCents: null, clinicId: base.clinicId, expectedVersion: 1,
      initialSourceId: null, opportunityId: crypto.randomUUID(), title: base.title,
    };
    expect(opportunitiesModule.updateOpportunitySchema.safeParse(update).success).toBe(true);
    expect(opportunitiesModule.updateOpportunitySchema.safeParse({ ...update, expectedVersion: 0 }).success).toBe(false);
    expect(opportunitiesModule.updateOpportunitySchema.safeParse({ ...update, status: "won" }).success).toBe(false);
  });

  it("exige motivo de perda e motivo válido de reabertura", () => {
    const base = {
      clinicId: crypto.randomUUID(), expectedVersion: 1,
      opportunityId: crypto.randomUUID(), targetStatus: "lost" as const,
    };
    expect(opportunitiesModule.closeOpportunitySchema.safeParse({ ...base, closeReason: null }).success).toBe(false);
    expect(opportunitiesModule.closeOpportunitySchema.safeParse({ ...base, closeReason: "Sem retorno" }).success).toBe(true);
    expect(opportunitiesModule.reopenOpportunitySchema.safeParse({
      clinicId: base.clinicId, expectedVersion: 1, opportunityId: base.opportunityId,
      reason: "x", targetStageId: crypto.randomUUID(),
    }).success).toBe(false);
  });

  it("calcula posições intermediárias e ordena com ID como desempate", () => {
    expect(opportunitiesModule.calculateBoardPosition(100, 200)).toBe(150);
    expect(opportunitiesModule.calculateBoardPosition(100, null)).toBe(1100);
    expect(opportunitiesModule.calculateBoardPosition(null, 100)).toBe(-900);
    expect(opportunitiesModule.calculateBoardPosition(null, null, 300)).toBe(1300);
    expect(() => opportunitiesModule.calculateBoardPosition(200, 100)).toThrow("invalid_board_neighbors");
    expect(opportunitiesModule.sortBoardCards([
      { board_position: 20, id: "b" }, { board_position: 10, id: "z" },
      { board_position: 20, id: "a" },
    ]).map((item) => item.id)).toEqual(["z", "a", "b"]);
  });

  it("aplica janela inclusiva de 24 horas", () => {
    const now = new Date("2026-07-28T12:00:00.000Z");
    expect(opportunitiesModule.canReopenAt("2026-07-27T12:00:00.000Z", now)).toBe(true);
    expect(opportunitiesModule.canReopenAt("2026-07-27T11:59:59.999Z", now)).toBe(false);
    expect(opportunitiesModule.canReopenAt("invalid", now)).toBe(false);
  });

  it("resolve all antes de own e mantém órfã fora do escopo own", async () => {
    requirePermission.mockResolvedValueOnce({ allowed: true, session: { aal: "aal1", userId: crypto.randomUUID() } });
    expect(await opportunitiesModule.resolveOpportunityScope(crypto.randomUUID())).toMatchObject({ ok: true, scope: "all" });
    requirePermission.mockReset();
    const userId = crypto.randomUUID();
    requirePermission.mockResolvedValueOnce({ allowed: false, code: "forbidden" })
      .mockResolvedValueOnce({ allowed: true, session: { aal: "aal1", userId } });
    expect(await opportunitiesModule.resolveOpportunityScope(crypto.randomUUID())).toEqual({ ok: true, scope: "own", userId });
    expect((null as string | null) === userId).toBe(false);
  });

  it("retorna alerta sem criar quando o banco exige confirmação explícita", async () => {
    requirePermission.mockResolvedValue({ allowed: true, session: { aal: "aal1", userId: crypto.randomUUID() } });
    const rpc = vi.fn().mockResolvedValue({
      data: [{ has_existing_open: true, opportunity_id: null }], error: null,
    });
    createServerSupabaseClient.mockResolvedValue({ rpc } as never);
    const result = await opportunitiesModule.createOpportunity({
      amountCents: null, clinicId: crypto.randomUUID(), confirmedExistingOpen: false,
      contactId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(),
      initialSourceId: null, title: "Nova oportunidade",
    });
    expect(result).toEqual({ ok: false, code: "existing_open", needsConfirmation: true });
    expect(rpc).toHaveBeenCalledWith("create_opportunity", expect.objectContaining({
      confirmed_existing_open: false,
    }));
  });
});
