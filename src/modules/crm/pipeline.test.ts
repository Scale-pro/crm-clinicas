import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/auth", () => ({ requireAal2: vi.fn(), requirePermission: vi.fn() }));
vi.mock("@/shared/db", () => ({ createServerSupabaseClient: vi.fn() }));

let schemas: typeof import("./pipeline");

beforeAll(async () => {
  schemas = await import("./pipeline");
});

describe("configuração de pipeline", () => {
  it("aceita somente nome e tenant na criação", () => {
    const input = { clinicId: crypto.randomUUID(), name: "Qualificado" };
    expect(schemas.createPipelineStageSchema.safeParse(input).success).toBe(true);
    expect(schemas.createPipelineStageSchema.safeParse({ ...input, stageKind: "won" }).success).toBe(false);
  });

  it("rejeita ordem incompleta malformada e IDs repetidos", () => {
    const clinicId = crypto.randomUUID();
    const stageId = crypto.randomUUID();
    expect(schemas.reorderPipelineStagesSchema.safeParse({ clinicId, stageIds: [stageId] }).success).toBe(true);
    expect(schemas.reorderPipelineStagesSchema.safeParse({ clinicId, stageIds: [stageId, stageId] }).success).toBe(false);
    expect(schemas.reorderPipelineStagesSchema.safeParse({ clinicId, stageIds: [] }).success).toBe(false);
  });
});
