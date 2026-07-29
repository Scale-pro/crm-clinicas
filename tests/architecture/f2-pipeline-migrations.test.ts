import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const migration = (name: string) => readFileSync(
  path.join(root, "supabase/migrations", name), "utf8",
).toLowerCase();
const pipeline = migration("20260728200000_f2_2_pipeline_schema.sql");
const opportunities = migration("20260728201000_f2_2_opportunity_schema.sql");
const events = migration("20260728202000_f2_2_opportunity_stage_history.sql");
const permissions = migration("20260728203000_f2_2_opportunity_permissions.sql");
const opportunityRpcs = migration("20260728204000_f2_2_opportunity_write_rpcs.sql");
const pipelineRpcs = migration("20260728205000_f2_2_pipeline_configuration_rpcs.sql");
const boardSearch = migration("20260728206000_f2_2_opportunity_board_search.sql");
const contactVisibility = migration("20260728207000_f2_2_opportunity_contact_visibility.sql");
const reopenGuard = migration("20260728211500_f2_2_6_archived_pipeline_reopen_guard.sql");
const paginationGuard = migration(
  "20260728211600_f2_2_6_opportunity_search_pagination_guard.sql",
);

const tables = ["pipelines", "pipeline_stages", "opportunities", "opportunity_stage_events"];
const rpcNames = [
  "create_opportunity", "update_opportunity", "move_opportunity",
  "close_opportunity", "reopen_opportunity", "assign_opportunity",
  "create_pipeline_stage", "update_pipeline_stage", "reorder_pipeline_stages",
];

describe("migrations de pipeline F2.2", () => {
  it("cria quatro tabelas tenant-scoped com RLS somente de leitura", () => {
    const schema = `${pipeline}\n${opportunities}\n${events}`;
    for (const table of tables) {
      expect(schema).toContain(`create table public.${table}`);
      expect(schema).toContain(`alter table public.${table} enable row level security`);
      expect(schema).toContain(`alter table public.${table} force row level security`);
      expect(schema).toContain(`create policy ${table}_select`);
    }
    expect(schema).not.toMatch(/for (?:insert|update|delete)\s+to authenticated/);
  });

  it("mantém integridade de tenant, pipeline, status e responsável órfão", () => {
    expect(opportunities).toContain("foreign key (clinic_id, contact_id)");
    expect(opportunities).toContain("foreign key (clinic_id, pipeline_id)");
    expect(opportunities).toContain("foreign key (pipeline_id, stage_id, status)");
    expect(opportunities).toContain("foreign key (clinic_id, assigned_to_user_id)");
    expect(opportunities).toContain("on delete set null (assigned_to_user_id)");
    expect(opportunities).toContain("check ((status = 'open') = (closed_at is null))");
  });

  it("faz bootstrap de clínicas existentes e futuras com cinco etapas", () => {
    expect(pipeline).toContain("clinics_bootstrap_default_pipeline");
    expect(pipeline).toContain("for v_clinic_id in select c.id");
    for (const stage of ["novo lead", "contato feito", "reunião agendada", "ganho", "perdido"]) {
      expect(pipeline).toContain(`'${stage}'`);
    }
    expect(pipeline).toContain("pipelines_one_active_default_idx");
    expect(pipeline).toContain("pipeline_stages_one_won_idx");
    expect(pipeline).toContain("pipeline_stages_one_lost_idx");
  });

  it("semeia exatamente as dez permissões com matriz de 37 concessões", () => {
    const keys = [...permissions.matchAll(/\('([a-z_]+\.[a-z_]+)'\)/g)].map((match) => match[1]);
    expect(new Set(keys).size).toBe(10);
    expect(keys).toContain("opportunity.reopen");
    expect(keys).toContain("pipeline.manage");
    expect((permissions.match(/\('[a-z]+', '[a-z_]+\.[a-z_]+'\)/g) ?? [])).toHaveLength(37);
  });

  it("expõe exatamente nove RPCs, todas endurecidas", () => {
    const sql = `${opportunityRpcs}\n${pipelineRpcs}`;
    const created = [...sql.matchAll(/create function public\.([a-z_]+)/g)].map((match) => match[1]);
    expect(created).toEqual(rpcNames);
    for (const rpc of rpcNames) {
      const body = sql.split(`create function public.${rpc}`)[1]!;
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = ''");
      expect(body).toContain("#variable_conflict use_variable");
      expect(sql).toContain(`alter function public.${rpc}`);
      expect(sql).toContain(`revoke all on function public.${rpc}`);
      expect(sql).toContain(`grant execute on function public.${rpc}`);
    }
  });

  it("expõe a leitura paginada em allowlist explícita sem elevar privilégios", () => {
    const readRpcNames = [
      ...boardSearch.matchAll(/create function public\.([a-z_]+)/g),
    ].map((match) => match[1]);
    expect(readRpcNames).toEqual(["search_opportunity_board"]);
    expect(boardSearch).toContain("security invoker");
    expect(boardSearch).not.toContain("security definer");
    expect(boardSearch).toContain("grant execute on function public.search_opportunity_board");
    expect(boardSearch).toContain("from public, anon, authenticated");
    expect(boardSearch).toContain("order by ps.position, o.board_position, o.id");
    expect(paginationGuard).toContain("p_page between 1 and 1000000");
    expect(paginationGuard).toContain("p_page_size between 1 and 100");
    expect(paginationGuard).toContain("then p_page_size + 1");
    expect(paginationGuard).toContain("security invoker");
    expect(paginationGuard).not.toContain("limit least(greatest(p_page_size");
    expect(boardSearch).not.toContain("execute format");
  });

  it("amplia somente contacts_select por oportunidade sujeita a RLS", () => {
    expect(contactVisibility).toContain("drop policy contacts_select");
    expect(contactVisibility.match(/create policy contacts_select/g)).toHaveLength(1);
    expect(contactVisibility).toContain("from public.opportunities as visible_opportunity");
    expect(contactVisibility).toContain("visible_opportunity.contact_id = contacts.id");
    expect(contactVisibility).not.toMatch(/for (?:insert|update|delete|all)/);
    expect(contactVisibility).not.toMatch(/security definer|grant (?:insert|update|delete)/);
  });

  it("usa AAL2 somente em reopen e configuração do pipeline", () => {
    const routine = (sql: string, name: string) => {
      const fragment = sql.split(`create function public.${name}`)[1]!;
      return fragment.split("\ncreate function public.")[0]!;
    };
    expect(routine(opportunityRpcs, "reopen_opportunity")).toContain("require_aal2");
    for (const name of ["create_opportunity", "update_opportunity", "move_opportunity", "close_opportunity", "assign_opportunity"]) {
      expect(routine(opportunityRpcs, name)).not.toContain("require_aal2");
    }
    for (const name of ["create_pipeline_stage", "update_pipeline_stage", "reorder_pipeline_stages"]) {
      expect(routine(pipelineRpcs, name)).toContain("require_aal2");
    }
  });

  it("protege concorrência, janela de reabertura e histórico append-only", () => {
    expect(opportunityRpcs).toContain("for update");
    expect(opportunityRpcs).toContain("errcode = 'p4091'");
    expect(opportunityRpcs).toContain("interval '24 hours'");
    expect(events).not.toContain("updated_at");
    expect(events).not.toMatch(/for (?:update|delete)/);
    expect(pipeline).toContain("deferrable initially deferred");
    expect(reopenGuard).toContain("from public.pipelines as p");
    expect(reopenGuard).toContain("for update");
    expect(reopenGuard).toContain("v_pipeline.archived_at is not null");
    expect(reopenGuard).toContain("errcode = 'p4201'");
  });

  it("não envia PII de contato para auditoria ou activities", () => {
    expect(`${opportunityRpcs}\n${pipelineRpcs}`).not.toMatch(/raw_value|normalized_value|phone|email/);
  });
});
