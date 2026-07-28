import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/auth", () => ({ requirePermission: vi.fn() }));
vi.mock("@/shared/db", () => ({ createServerSupabaseClient: vi.fn() }));

let createContactSchema: typeof import("./contacts")["createContactSchema"];
let conflictingContactId: typeof import("./contacts")["conflictingContactId"];
let listContacts: typeof import("./contacts")["listContacts"];
let mapCrmError: typeof import("./contacts")["mapCrmError"];
let resolveContactScope: typeof import("./contacts")["resolveContactScope"];
let updateContactSchema: typeof import("./contacts")["updateContactSchema"];
let createServerSupabaseClient: ReturnType<typeof vi.fn>;
let requirePermission: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  ({
    conflictingContactId,
    createContactSchema,
    listContacts,
    mapCrmError,
    resolveContactScope,
    updateContactSchema,
  } = await import("./contacts"));
  requirePermission = vi.mocked((await import("@/shared/auth")).requirePermission);
  createServerSupabaseClient = vi.mocked(
    (await import("@/shared/db")).createServerSupabaseClient,
  );
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
    expect(mapCrmError({ code: "P4091", message: "detalhe interno" })).toBe("conflict");
    expect(mapCrmError({ code: "XX000", message: "stack interna" })).toBe("unavailable");
    const contactId = crypto.randomUUID();
    expect(
      conflictingContactId({
        code: "23505",
        details: JSON.stringify({ contact_id: contactId }),
      }),
    ).toBe(contactId);
    expect(conflictingContactId({ code: "23505", details: "não-json" })).toBeNull();
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

  it.each([
    ["(11) 99876-5432", "+5511998765432"],
    [" Maria.Antiga+crm@Example.Test ", "maria.antiga+crm@example.test"],
    ["Maria Silva", null],
  ])("delega busca e limite validados ao banco para %s", async (search, normalized) => {
    const clinicId = crypto.randomUUID();
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    requirePermission.mockReset();
    requirePermission.mockResolvedValue({
      allowed: true,
      session: { aal: "aal1", userId: crypto.randomUUID() },
    });
    createServerSupabaseClient.mockResolvedValue({ rpc } as never);

    expect(await listContacts({
      clinicId,
      includeArchived: false,
      limit: 7,
      search,
    })).toMatchObject({ ok: true, contacts: [] });
    expect(rpc).toHaveBeenCalledWith("search_contacts", {
      p_clinic_id: clinicId,
      p_include_archived: false,
      p_limit: 7,
      p_normalized_value: normalized,
      p_owner_user_id: null,
      p_search_term: search.trim(),
    });
  });

  it("não consulta arquivados sem contact.archive", async () => {
    requirePermission.mockReset();
    requirePermission
      .mockResolvedValueOnce({
        allowed: true,
        session: { aal: "aal1", userId: crypto.randomUUID() },
      })
      .mockResolvedValueOnce({ allowed: false, code: "forbidden" });
    createServerSupabaseClient.mockReset();

    expect(await listContacts({
      clinicId: crypto.randomUUID(),
      includeArchived: true,
      limit: 10,
      search: "Arquivado",
    })).toEqual({ ok: false, code: "forbidden" });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
});
