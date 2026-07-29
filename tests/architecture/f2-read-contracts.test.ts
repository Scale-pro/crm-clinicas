import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

const tenancyContract = read("src/modules/tenancy/clinic-members.ts");
const tenancyPublicApi = read("src/modules/tenancy/index.ts");
const pipelineContract = read("src/modules/crm/pipeline-stages.ts");
const crmPublicApi = read("src/modules/crm/index.ts");

describe("contratos públicos de leitura F2.3.1.2", () => {
  it("expõe ambos somente pelos entrypoints públicos server-only", () => {
    expect(tenancyPublicApi.startsWith('import "server-only";')).toBe(true);
    expect(crmPublicApi.startsWith('import "server-only";')).toBe(true);
    expect(tenancyPublicApi).toContain("listActiveClinicMembers");
    expect(tenancyPublicApi).toContain('from "./clinic-members"');
    expect(crmPublicApi).toContain("listPipelineStages");
    expect(crmPublicApi).toContain('from "./pipeline-stages"');
  });

  it("mantém os contratos server-only, Zod strict e dentro de shared/db", () => {
    for (const contract of [tenancyContract, pipelineContract]) {
      expect(contract.startsWith('import "server-only";')).toBe(true);
      expect(contract).toContain(".strict()");
      expect(contract).toContain('from "@/shared/db"');
      expect(contract).not.toMatch(/@supabase|createClient|createServiceRoleClient/);
    }
  });

  it("limita o diretório a membros ativos e perfis sem PII de autenticação", () => {
    expect(tenancyContract).toContain('.from("clinic_members")');
    expect(tenancyContract).toContain('.eq("status", "active")');
    expect(tenancyContract).toContain('.from("profiles")');
    expect(tenancyContract).toContain('.select("user_id,full_name,avatar_url")');
    expect(tenancyContract).not.toMatch(/auth\.users|service.?role|\.select\([^)]*(email|phone|metadata)/i);
  });

  it("lê pipeline e etapas por tenant sem RPC, DML ou pipeline.manage", () => {
    expect(pipelineContract).toContain('.from("pipelines")');
    expect(pipelineContract).toContain('.from("pipeline_stages")');
    expect(pipelineContract).toContain('"opportunity.view_all"');
    expect(pipelineContract).toContain('"opportunity.view_own"');
    expect(pipelineContract).not.toMatch(/pipeline\.manage|\.rpc\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });

  it("não autoriza por comparação direta de cargo", () => {
    expect(`${tenancyContract}\n${pipelineContract}`).not.toMatch(
      /role\s*(?:===|==)\s*["'](?:owner|admin|manager)["']/,
    );
  });
});
