import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const migration = (name: string) => readFileSync(
  path.join(root, "supabase/migrations", name), "utf8",
).toLowerCase();

const management = migration("20260728208000_f2_2_6_pipeline_management.sql");
const opportunity = migration("20260728209000_f2_2_6_selected_pipeline_opportunities.sql");
const search = migration("20260728210000_f2_2_6_all_pipeline_search.sql");
const stages = migration("20260728211000_f2_2_6_multi_pipeline_stage_configuration.sql");

const managementRpcs = [
  "create_pipeline",
  "duplicate_pipeline",
  "rename_pipeline",
  "set_default_pipeline",
  "archive_pipeline",
];

function routine(sql: string, name: string) {
  const fragment = sql.split(`create function public.${name}`)[1]!;
  return fragment.split("\ncreate function public.")[0]!;
}

describe("backend de múltiplas pipelines F2.2.6", () => {
  it("expõe exatamente as cinco novas mutações públicas endurecidas", () => {
    const created = [...management.matchAll(/create function public\.([a-z_]+)/g)]
      .map((match) => match[1]);
    expect(created).toEqual(managementRpcs);
    for (const rpc of managementRpcs) {
      const body = routine(management, rpc);
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = ''");
      expect(body).toContain("#variable_conflict use_variable");
      expect(body).toContain("pipeline.manage");
      expect(body).toContain("require_aal2");
      expect(management).toContain(`alter function public.${rpc}`);
      expect(management).toContain(`revoke all on function public.${rpc}`);
      expect(management).toContain(`grant execute on function public.${rpc}`);
    }
  });

  it("mantém criação e duplicação idempotentes e somente estruturais", () => {
    expect(management).toContain("pipelines_clinic_creation_idempotency_idx");
    expect(management).toContain("pipelines_clinic_duplication_idempotency_idx");
    expect(routine(management, "create_pipeline")).toContain("'novo lead'");
    const duplicate = routine(management, "duplicate_pipeline");
    expect(duplicate).toContain("from public.pipeline_stages");
    expect(duplicate).not.toMatch(/opportunity_stage_events|activities/);
    expect(duplicate).toContain("for share");
    expect(management).not.toMatch(/raw_value|normalized_value|phone|email|notes/);
  });

  it("serializa troca de padrão e arquivamento sem hard delete", () => {
    const setDefault = routine(management, "set_default_pipeline");
    const archive = routine(management, "archive_pipeline");
    expect(setDefault).toContain("from public.clinics");
    expect(setDefault).toContain("for update");
    expect(setDefault).toContain("set is_default = false");
    expect(setDefault).toContain("set is_default = true");
    expect(archive).toContain("status = 'open'");
    expect(archive).toContain("p4202");
    expect(archive).toContain("p4203");
    expect(archive).toContain("p4204");
    expect(archive).toContain("set archived_at");
    expect(management).not.toMatch(/delete from public\.pipelines/);
  });

  it("preserva fallback e aceita pipeline selecionada na criação", () => {
    expect(opportunity).toContain("pipeline_id uuid default null");
    expect(opportunity).toContain("p.is_default");
    expect(opportunity).toContain("p.id = v_requested_pipeline_id");
    expect(opportunity).toContain("for share");
    expect(opportunity).toContain("p4201");
    expect(opportunity).toContain("order by ps.position, ps.id");
    expect(opportunity).toContain("'pipeline_id', v_pipeline_id");
  });

  it("busca uma ou todas as pipelines sob RLS sem SQL dinâmico", () => {
    expect(search).toContain("security invoker");
    expect(search).toContain("p_pipeline_id is null or o.pipeline_id = p_pipeline_id");
    expect(search).toContain("p.name as pipeline_name");
    expect(search).toContain("p.archived_at as pipeline_archived_at");
    expect(search).toContain("order by p.name, p.id, ps.position, o.board_position, o.id");
    expect(search).not.toMatch(/security definer|execute format|dynamic/);
  });

  it("configura qualquer pipeline ativa e serializa com duplicação", () => {
    expect(stages).toContain("pipeline_id uuid default null");
    expect(stages).toContain("p.id = v_requested_pipeline_id");
    expect(stages).toContain("select ps.pipeline_id into v_pipeline_id");
    expect(stages).toContain("for update");
    expect(stages).toContain("p4201");
    expect(stages).not.toContain("and p.is_default and p.archived_at is null for update of ps");
  });
});
