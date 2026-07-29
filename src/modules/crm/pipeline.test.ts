import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/auth", () => ({
  requireAal2: vi.fn(),
  requireClinicAccess: vi.fn(),
  requirePermission: vi.fn(),
}));
vi.mock("@/shared/db", () => ({ createServerSupabaseClient: vi.fn() }));

let schemas: typeof import("./pipeline");

beforeAll(async () => {
  schemas = await import("./pipeline");
});

describe("configuração de pipeline", () => {
  it("valida contratos estritos das cinco operações de pipeline", () => {
    const clinicId = crypto.randomUUID();
    const pipelineId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    expect(schemas.createPipelineSchema.safeParse({
      clinicId, idempotencyKey, name: "Comercial",
    }).success).toBe(true);
    expect(schemas.duplicatePipelineSchema.safeParse({
      clinicId, idempotencyKey, name: "Comercial", sourcePipelineId: pipelineId,
    }).success).toBe(true);
    expect(schemas.renamePipelineSchema.safeParse({
      clinicId, name: "Renomeada", pipelineId,
    }).success).toBe(true);
    expect(schemas.pipelineIdSchema.safeParse({ clinicId, pipelineId }).success).toBe(true);
    expect(schemas.createPipelineSchema.safeParse({
      archivedAt: new Date().toISOString(), clinicId, idempotencyKey, name: "Comercial",
    }).success).toBe(false);
    expect(schemas.createPipelineSchema.safeParse({
      clinicId, idempotencyKey: "repetir", name: "Comercial",
    }).success).toBe(false);
  });

  it("aceita nome, tenant e pipeline opcional na criação de etapa", () => {
    const input = { clinicId: crypto.randomUUID(), name: "Qualificado" };
    expect(schemas.createPipelineStageSchema.safeParse(input).success).toBe(true);
    expect(schemas.createPipelineStageSchema.safeParse({ ...input, stageKind: "won" }).success).toBe(false);
    expect(schemas.createPipelineStageSchema.safeParse({
      ...input, pipelineId: crypto.randomUUID(),
    }).success).toBe(true);
  });

  it("rejeita ordem incompleta malformada e IDs repetidos", () => {
    const clinicId = crypto.randomUUID();
    const stageId = crypto.randomUUID();
    expect(schemas.reorderPipelineStagesSchema.safeParse({ clinicId, stageIds: [stageId] }).success).toBe(true);
    expect(schemas.reorderPipelineStagesSchema.safeParse({ clinicId, stageIds: [stageId, stageId] }).success).toBe(false);
    expect(schemas.reorderPipelineStagesSchema.safeParse({ clinicId, stageIds: [] }).success).toBe(false);
  });
});
