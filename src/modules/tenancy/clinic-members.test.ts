import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/auth", () => ({ requireClinicAccess: vi.fn() }));
vi.mock("@/shared/db", () => ({ createServerSupabaseClient: vi.fn() }));

let api: typeof import("./clinic-members");
let createServerSupabaseClient: ReturnType<typeof vi.fn>;
let requireClinicAccess: ReturnType<typeof vi.fn>;

const clinicId = "10000000-0000-4000-8000-000000000001";
const userA = "10000000-0000-4000-8000-000000000002";
const userB = "10000000-0000-4000-8000-000000000003";
const userC = "10000000-0000-4000-8000-000000000004";

function queryResult(data: unknown[], error: unknown = null) {
  const query: Record<string, unknown> = { data, error };
  for (const method of ["eq", "in", "order", "select"]) {
    query[method] = vi.fn(() => query);
  }
  return query as {
    data: unknown[];
    error: unknown;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  };
}

function configureDirectory(
  members: unknown[],
  profiles: unknown[],
  options: { memberError?: unknown; profileError?: unknown } = {},
) {
  const memberQuery = queryResult(members, options.memberError ?? null);
  const profileQuery = queryResult(profiles, options.profileError ?? null);
  const from = vi.fn((table: string) => {
    if (table === "clinic_members") return memberQuery;
    if (table === "profiles") return profileQuery;
    throw new Error(`unexpected table: ${table}`);
  });
  createServerSupabaseClient.mockResolvedValue({ from } as never);
  return { from, memberQuery, profileQuery };
}

beforeAll(async () => {
  api = await import("./clinic-members");
  requireClinicAccess = vi.mocked((await import("@/shared/auth")).requireClinicAccess);
  createServerSupabaseClient = vi.mocked(
    (await import("@/shared/db")).createServerSupabaseClient,
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  requireClinicAccess.mockResolvedValue({
    allowed: true,
    session: { aal: "aal1", userId: userA },
  });
});

describe("listActiveClinicMembers", () => {
  it("aceita entrada válida, aplica defaults e mantém schema strict", () => {
    expect(api.listActiveClinicMembersSchema.parse({ clinicId })).toEqual({
      clinicId,
      search: "",
      page: 1,
      pageSize: 50,
    });
    expect(api.listActiveClinicMembersSchema.safeParse({ clinicId, email: "x@example.test" }).success)
      .toBe(false);
  });

  it("rejeita clinicId e paginação inválidos antes de consultar guards ou banco", async () => {
    expect(await api.listActiveClinicMembers({ clinicId: "invalid" })).toEqual({
      ok: false,
      code: "invalid_input",
    });
    expect(api.listActiveClinicMembersSchema.safeParse({ clinicId, page: 0, pageSize: 101 }).success)
      .toBe(false);
    expect(requireClinicAccess).not.toHaveBeenCalled();
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("normaliza busca por nome com trim, caixa e diacríticos", async () => {
    configureDirectory(
      [
        { user_id: userA, role: "owner", status: "active" },
        { user_id: userB, role: "viewer", status: "active" },
      ],
      [
        { user_id: userA, full_name: "Álvaro Lima", avatar_url: null },
        { user_id: userB, full_name: "Beatriz Souza", avatar_url: null },
      ],
    );

    const result = await api.listActiveClinicMembers({ clinicId, search: "  ALVARO  " });
    expect(result).toMatchObject({ ok: true, total: 1 });
    if (result.ok) expect(result.items.map((item) => item.fullName)).toEqual(["Álvaro Lima"]);
  });

  it("consulta somente memberships ativos da clínica solicitada", async () => {
    const { memberQuery } = configureDirectory([], []);
    await api.listActiveClinicMembers({ clinicId });

    expect(memberQuery.eq).toHaveBeenNthCalledWith(1, "clinic_id", clinicId);
    expect(memberQuery.eq).toHaveBeenNthCalledWith(2, "status", "active");
  });

  it("ordena por nome normalizado e usa userId como desempate determinístico", async () => {
    configureDirectory(
      [
        { user_id: userB, role: "viewer", status: "active" },
        { user_id: userC, role: "manager", status: "active" },
        { user_id: userA, role: "owner", status: "active" },
      ],
      [
        { user_id: userB, full_name: "Zélia", avatar_url: null },
        { user_id: userC, full_name: "Ana", avatar_url: null },
        { user_id: userA, full_name: "Ana", avatar_url: null },
      ],
    );

    const result = await api.listActiveClinicMembers({ clinicId });
    if (!result.ok) throw new Error("unexpected failure");
    expect(result.items.map((item) => item.userId)).toEqual([userA, userC, userB]);
  });

  it("pagina com limite seguro e retorna total e hasMore coerentes", async () => {
    configureDirectory(
      [userA, userB, userC].map((user_id) => ({ user_id, role: "viewer", status: "active" })),
      [
        { user_id: userA, full_name: "Ana", avatar_url: null },
        { user_id: userB, full_name: "Bruna", avatar_url: null },
        { user_id: userC, full_name: "Carla", avatar_url: null },
      ],
    );

    const result = await api.listActiveClinicMembers({ clinicId, page: 2, pageSize: 1 });
    expect(result).toMatchObject({ ok: true, page: 2, pageSize: 1, total: 3, hasMore: true });
    if (result.ok) expect(result.items[0]?.fullName).toBe("Bruna");
  });

  it("nega acesso antes de consultar qualquer tabela", async () => {
    requireClinicAccess.mockResolvedValue({ allowed: false, code: "forbidden" });
    expect(await api.listActiveClinicMembers({ clinicId })).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("restringe perfis aos IDs obtidos na mesma clínica e não consulta Auth", async () => {
    const { from, profileQuery } = configureDirectory(
      [{ user_id: userA, role: "owner", status: "active" }],
      [{ user_id: userA, full_name: "Ana", avatar_url: null }],
    );
    await api.listActiveClinicMembers({ clinicId });

    expect(profileQuery.in).toHaveBeenCalledWith("user_id", [userA]);
    expect(from.mock.calls.map(([table]) => table)).toEqual(["clinic_members", "profiles"]);
  });

  it("expõe somente o diretório mínimo, sem e-mail, telefone ou metadata", async () => {
    configureDirectory(
      [{ user_id: userA, role: "owner", status: "active", clinic_id: clinicId }],
      [{
        user_id: userA,
        full_name: "Ana",
        avatar_url: "https://example.test/avatar.png",
        email: "private@example.test",
        phone: "+5511999999999",
        metadata: { secret: true },
      }],
    );

    const result = await api.listActiveClinicMembers({ clinicId });
    if (!result.ok) throw new Error("unexpected failure");
    expect(Object.keys(result.items[0]!).sort()).toEqual([
      "avatarUrl", "fullName", "role", "status", "userId",
    ]);
  });

  it("mapeia falhas de banco e exceções para unavailable sem mensagem crua", async () => {
    configureDirectory([], [], { memberError: { message: "database internals" } });
    expect(await api.listActiveClinicMembers({ clinicId })).toEqual({
      ok: false,
      code: "unavailable",
    });

    createServerSupabaseClient.mockRejectedValueOnce(new Error("secret stack"));
    expect(await api.listActiveClinicMembers({ clinicId })).toEqual({
      ok: false,
      code: "unavailable",
    });
  });
});
