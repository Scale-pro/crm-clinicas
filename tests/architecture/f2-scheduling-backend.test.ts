import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (name: string) => readFileSync(
  path.join(root, "supabase/migrations", name), "utf8",
).toLowerCase();
const schema = read("20260728212000_f2_3_1_scheduling_schema.sql");
const permissions = read("20260728213000_f2_3_1_scheduling_permissions.sql");
const professionalRpcs = read("20260728214000_f2_3_1_professional_rpcs.sql");
const procedureRpcs = read("20260728215000_f2_3_1_procedure_rpcs.sql");
const rpcs = `${professionalRpcs}\n${procedureRpcs}`;

const tables = [
  "professionals",
  "professional_specialties",
  "procedures",
  "professional_procedures",
  "professional_weekly_availability",
];
const mutations = [
  "create_professional",
  "update_professional",
  "archive_professional",
  "set_professional_specialties",
  "link_professional_user",
  "unlink_professional_user",
  "set_professional_weekly_availability",
  "create_procedure",
  "update_procedure",
  "archive_procedure",
  "set_professional_procedure",
  "archive_professional_procedure",
];

describe("backend de scheduling F2.3.1", () => {
  it("cria cinco tabelas tenant-scoped com RLS forçado e leitura separada", () => {
    for (const table of tables) {
      expect(schema).toContain(`create table public.${table}`);
      expect(schema).toContain(`alter table public.${table} enable row level security`);
      expect(schema).toContain(`alter table public.${table} force row level security`);
      expect(schema).toContain(`create policy ${table}_select`);
    }
    expect(schema).not.toMatch(/for (?:insert|update|delete)\s+to authenticated/);
  });

  it("preserva tenant em todas as relações e índices operacionais", () => {
    expect(schema.match(/foreign key \(clinic_id, professional_id\)/g)).toHaveLength(3);
    expect(schema).toContain("foreign key (clinic_id, procedure_id)");
    expect(schema).toContain("foreign key (clinic_id, user_id)");
    for (const index of schema.matchAll(/create (?:unique )?index [^\n]+\n?\s*on public\.[^(]+ \(([^)]+)/g)) {
      if (index[0].includes("clinic_")) expect(index[1]?.trim()).toMatch(/^clinic_id/);
    }
  });

  it("mantém unicidade, soft archive, versões e limites no banco", () => {
    expect(schema).toContain("professionals_clinic_active_user_idx");
    expect(schema).toContain("procedures_clinic_active_name_idx");
    expect(schema).toContain("professional_procedures_clinic_pair_key");
    expect(schema).toContain("base_price_cents between 0 and 9007199254740991");
    expect(schema).toContain("default_duration_minutes between 5 and 1440");
    expect(rpcs).not.toMatch(/delete from public\.(professionals|procedures|professional_procedures)/);
  });

  it("bloqueia overlap concorrente sem extensão e permite adjacência", () => {
    const overlap = schema.split("create function app_private.prevent_professional_availability_overlap")[1]!;
    expect(overlap).toContain("pg_advisory_xact_lock");
    expect(overlap).toContain("availability.start_minute < new.end_minute");
    expect(overlap).toContain("new.start_minute < availability.end_minute");
    expect(schema).not.toContain("create extension");
  });

  it("endurece as doze mutações com autorização, AAL2 e grants mínimos", () => {
    const created = [...rpcs.matchAll(/create function public\.([a-z_]+)/g)]
      .map((match) => match[1]);
    expect(created).toEqual(mutations);
    for (const mutation of mutations) {
      const body = rpcs.split(`create function public.${mutation}`)[1]!;
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = ''");
      expect(body).toContain("#variable_conflict use_variable");
      expect(body).toContain("require_aal2");
      expect(rpcs).toContain(`revoke all on function public.${mutation}`);
      expect(rpcs).toContain(`grant execute on function public.${mutation}`);
    }
  });

  it("expõe leituras invoker paginadas e DTO efetivo explícito", () => {
    for (const search of ["search_professionals", "search_procedures", "search_professional_procedures"]) {
      const body = schema.split(`create function public.${search}`)[1]!;
      expect(body).toContain("security invoker");
      expect(body).not.toContain("security definer");
      expect(body).toContain("p_page_size between 1 and 100");
      expect(body).toContain("offset case when p_page >= 1");
      expect(body).toContain("count(*) over()");
    }
    expect(schema).toContain("effective_duration_minutes");
    expect(schema).toContain("has_duration_override");
    expect(schema).toContain("effective_price_cents");
    expect(schema).toContain("has_price_override");
  });

  it("semeia quatro permissões sem autorização por cargo nas RPCs", () => {
    expect([...permissions.matchAll(/\('([a-z_]+\.[a-z_]+)'\)/g)]
      .map((match) => match[1])).toEqual([
      "professional.view", "professional.manage", "procedure.view", "procedure.manage",
    ]);
    expect(rpcs).not.toMatch(/role\s*=|role\s+in/);
  });

  it("não registra contato ou registro profissional na auditoria", () => {
    const auditCalls = rpcs.split("perform app_private.log_audit_event(").slice(1)
      .map((fragment) => fragment.slice(0, fragment.indexOf(");"))).join("\n");
    expect(auditCalls).not.toMatch(/jsonb_build_object\('(email|phone|registration_number|notes)'/);
  });
});
