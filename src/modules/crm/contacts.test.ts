import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/auth", () => ({ requirePermission: vi.fn() }));
vi.mock("@/shared/db", () => ({ createServerSupabaseClient: vi.fn() }));

let createContactSchema: typeof import("./contacts")["createContactSchema"];
let mapCrmError: typeof import("./contacts")["mapCrmError"];
let resolveContactScope: typeof import("./contacts")["resolveContactScope"];
let updateContactSchema: typeof import("./contacts")["updateContactSchema"];
let requirePermission: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  ({ createContactSchema, mapCrmError, resolveContactScope, updateContactSchema } =
    await import("./contacts"));
  requirePermission = vi.mocked((await import("@/shared/auth")).requirePermission);
});

describe("contratos públicos do módulo CRM", () => {
  it("usa schema strict e exige idempotency_key válido na criação", () => {
    const valid = {
      clinicId: crypto.randomUUID(),
      fullName: "Pessoa Fictícia",
      idempotencyKey: crypto.randomUUID(),
      methods: [],
      linkAsPatient: false,
    };
    expect(createContactSchema.safeParse(valid).success).toBe(true);
    expect(createContactSchema.safeParse({ ...valid, ownerUserId: crypto.randomUUID() }).success)
      .toBe(false);
    expect(createContactSchema.safeParse({ ...valid, idempotencyKey: "repetir" }).success)
      .toBe(false);
  });

  it("exige expected_version positivo e rejeita mass assignment", () => {
    const valid = {
      clinicId: crypto.randomUUID(),
      contactId: crypto.randomUUID(),
      fullName: "Pessoa Fictícia",
      notes: null,
      expectedVersion: 1,
    };
    expect(updateContactSchema.safeParse(valid).success).toBe(true);
    expect(updateContactSchema.safeParse({ ...valid, expectedVersion: 0 }).success).toBe(false);
    expect(updateContactSchema.safeParse({ ...valid, archivedAt: new Date().toISOString() }).success)
      .toBe(false);
  });

  it("mapeia erros do banco sem expor mensagens internas", () => {
    expect(mapCrmError({ code: "23505", message: "valor sensível" })).toBe("duplicate");
    expect(mapCrmError({ code: "40001", message: "detalhe interno" })).toBe("conflict");
    expect(mapCrmError({ code: "XX000", message: "stack interna" })).toBe("unavailable");
  });

  it("resolve view_all antes de view_own e não inclui owner nulo em own", async () => {
    requirePermission.mockResolvedValueOnce({
      allowed: true,
      session: { aal: "aal1", userId: crypto.randomUUID() },
    });
    expect(await resolveContactScope(crypto.randomUUID())).toMatchObject({
      ok: true,
      scope: "all",
    });
    expect(requirePermission).toHaveBeenCalledTimes(1);

    requirePermission.mockReset();
    const userId = crypto.randomUUID();
    requirePermission
      .mockResolvedValueOnce({ allowed: false, code: "forbidden" })
      .mockResolvedValueOnce({ allowed: true, session: { aal: "aal1", userId } });
    expect(await resolveContactScope(crypto.randomUUID())).toEqual({
      ok: true,
      scope: "own",
      userId,
    });
  });
});
