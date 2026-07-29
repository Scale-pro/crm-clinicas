import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/auth", () => ({
  requireClinicAccess: vi.fn(),
  requirePermission: vi.fn(),
}));
vi.mock("@/shared/db", () => ({ createServerSupabaseClient: vi.fn() }));

let api: typeof import("./pipeline-stages");
let createServerSupabaseClient: ReturnType<typeof vi.fn>;
let requireClinicAccess: ReturnType<typeof vi.fn>;
let requirePermission: ReturnType<typeof vi.fn>;

const clinicId = "20000000-0000-4000-8000-000000000001";
const pipelineId = "20000000-0000-4000-8000-000000000002";
const otherPipelineId = "20000000-0000-4000-8000-000000000003";
const userId = "20000000-0000-4000-8000-000000000004";

function configureRead(
  pipelineData: unknown,
  stagesData: unknown[] = [],
  options: { pipelineError?: unknown; stagesError?: unknown } = {},
) {
  const pipelineResult = { data: pipelineData, error: options.pipelineError ?? null };
  const pipelineQuery: Record<string, unknown> = {};
  for (const method of ["eq", "is", "select"]) {
    pipelineQuery[method] = vi.fn(() => pipelineQuery);
  }
  pipelineQuery.maybeSingle = vi.fn().mockResolvedValue(pipelineResult);

  const stagesQuery: Record<string, unknown> = {
    data: stagesData,
    error: options.stagesError ?? null,
  };
  for (const method of ["eq", "order", "select"]) {
    stagesQuery[method] = vi.fn(() => stagesQuery);
  }

  const from = vi.fn((table: string) => {
    if (table === "pipelines") return pipelineQuery;
    if (table === "pipeline_stages") return stagesQuery;
    throw new Error(`unexpected table: ${table}`);
  });
  const rpc = vi.fn();
  createServerSupabaseClient.mockResolvedValue({ from, rpc } as never);
  return {
    from,
    pipelineQuery: pipelineQuery as Record<string, ReturnType<typeof vi.fn>>,
    rpc,
    stagesQuery: stagesQuery as Record<string, ReturnType<typeof vi.fn>>,
  };
}

beforeAll(async () => {
  api = await import("./pipeline-stages");
  const auth = await import("@/shared/auth");
  requireClinicAccess = vi.mocked(auth.requireClinicAccess);
  requirePermission = vi.mocked(auth.requirePermission);
  createServerSupabaseClient = vi.mocked(
    (await import("@/shared/db")).createServerSupabaseClient,
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  requireClinicAccess.mockResolvedValue({
    allowed: true,
    session: { aal: "aal1", userId },
  });
  requirePermission.mockResolvedValue({
    allowed: true,
    session: { aal: "aal1", userId },
  });
});

describe("listPipelineStages", () => {
  it("valida entrada strict e aceita defaults para pipeline ativa", () => {
    expect(api.listPipelineStagesSchema.parse({ clinicId, pipelineId })).toEqual({
      clinicId,
      pipelineId,
      includeArchivedPipeline: false,
    });
    expect(api.listPipelineStagesSchema.safeParse({ clinicId, pipelineId, role: "owner" }).success)
      .toBe(false);
  });

  it("retorna pipeline ativa e DTO mínimo em camelCase", async () => {
    configureRead(
      { id: pipelineId, name: "Comercial", is_default: true, archived_at: null },
      [{ id: userId, name: "Novo lead", position: 100, stage_kind: "open" }],
    );

    expect(await api.listPipelineStages({ clinicId, pipelineId })).toEqual({
      ok: true,
      pipeline: { id: pipelineId, name: "Comercial", isDefault: true, archivedAt: null },
      stages: [{ id: userId, name: "Novo lead", position: 100, stageKind: "open" }],
    });
  });

  it("ordena etapas por position e id como desempate determinístico", async () => {
    const { stagesQuery } = configureRead(
      { id: pipelineId, name: "Comercial", is_default: true, archived_at: null },
      [],
    );
    await api.listPipelineStages({ clinicId, pipelineId });

    expect(stagesQuery.order).toHaveBeenNthCalledWith(1, "position");
    expect(stagesQuery.order).toHaveBeenNthCalledWith(2, "id");
  });

  it("oculta pipeline arquivada por padrão como not_found", async () => {
    const { from, pipelineQuery } = configureRead(null);
    expect(await api.listPipelineStages({ clinicId, pipelineId })).toEqual({
      ok: false,
      code: "not_found",
    });
    expect(pipelineQuery.is).toHaveBeenCalledWith("archived_at", null);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("permite leitura histórica somente quando includeArchivedPipeline é true", async () => {
    const archivedAt = "2026-07-29T00:00:00.000Z";
    const { pipelineQuery } = configureRead({
      id: pipelineId,
      name: "Histórica",
      is_default: false,
      archived_at: archivedAt,
    });
    const result = await api.listPipelineStages({
      clinicId,
      pipelineId,
      includeArchivedPipeline: true,
    });

    expect(result).toMatchObject({ ok: true, pipeline: { archivedAt } });
    expect(pipelineQuery.is).not.toHaveBeenCalled();
  });

  it("converte pipeline de outra clínica em not_found sem remover filtros de tenant", async () => {
    const { pipelineQuery } = configureRead(null);
    expect(await api.listPipelineStages({ clinicId, pipelineId: otherPipelineId })).toEqual({
      ok: false,
      code: "not_found",
    });
    expect(pipelineQuery.eq).toHaveBeenNthCalledWith(1, "clinic_id", clinicId);
    expect(pipelineQuery.eq).toHaveBeenNthCalledWith(2, "id", otherPipelineId);
  });

  it("exige acesso ativo e não consulta permissões nem banco quando negado", async () => {
    requireClinicAccess.mockResolvedValue({ allowed: false, code: "forbidden" });
    expect(await api.listPipelineStages({ clinicId, pipelineId })).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("aceita view_all ou view_own e nunca exige pipeline.manage", async () => {
    requirePermission
      .mockResolvedValueOnce({ allowed: false, code: "forbidden" })
      .mockResolvedValueOnce({ allowed: true, session: { aal: "aal1", userId } });
    configureRead({ id: pipelineId, name: "Comercial", is_default: true, archived_at: null });

    expect(await api.listPipelineStages({ clinicId, pipelineId })).toMatchObject({ ok: true });
    expect(requirePermission.mock.calls).toEqual([
      [clinicId, "opportunity.view_all"],
      [clinicId, "opportunity.view_own"],
    ]);
  });

  it("mapeia erros de pipeline, etapas e exceções para unavailable", async () => {
    configureRead(null, [], { pipelineError: { message: "raw database error" } });
    expect(await api.listPipelineStages({ clinicId, pipelineId })).toEqual({
      ok: false,
      code: "unavailable",
    });

    configureRead(
      { id: pipelineId, name: "Comercial", is_default: true, archived_at: null },
      [],
      { stagesError: { message: "raw stage error" } },
    );
    expect(await api.listPipelineStages({ clinicId, pipelineId })).toEqual({
      ok: false,
      code: "unavailable",
    });

    createServerSupabaseClient.mockRejectedValueOnce(new Error("secret stack"));
    expect(await api.listPipelineStages({ clinicId, pipelineId })).toEqual({
      ok: false,
      code: "unavailable",
    });
  });

  it("usa somente SELECT e nenhuma RPC de escrita", async () => {
    const { from, rpc } = configureRead({
      id: pipelineId,
      name: "Comercial",
      is_default: true,
      archived_at: null,
    });
    await api.listPipelineStages({ clinicId, pipelineId });

    expect(from.mock.calls.map(([table]) => table)).toEqual(["pipelines", "pipeline_stages"]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
