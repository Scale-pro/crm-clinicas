import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (name: string) => readFileSync(
  path.join(root, "supabase/migrations", name), "utf8",
).toLowerCase();
const schema = read("20260805120000_f4_appointments_schema.sql");
const permissions = read("20260805121000_f4_appointment_permissions.sql");
const rpcs = read("20260805122000_f4_appointment_rpcs.sql");

const mutations = [
  "create_appointment",
  "update_appointment_status",
  "reschedule_appointment",
];

describe("backend de agendamentos F4", () => {
  it("cria a tabela tenant-scoped com RLS forçado e leitura separada", () => {
    expect(schema).toContain("create table public.appointments");
    expect(schema).toContain("alter table public.appointments enable row level security");
    expect(schema).toContain("alter table public.appointments force row level security");
    expect(schema).toContain("create policy appointments_select");
    expect(schema).not.toMatch(/for (?:insert|update|delete)\s+to authenticated/);
    expect(schema).toContain(
      "revoke all on table public.appointments from public, anon, authenticated",
    );
  });

  it("preserva o tenant nas relações e mantém clinic_id primeiro nos índices", () => {
    expect(schema).toContain("foreign key (clinic_id, contact_id)");
    expect(schema).toContain("foreign key (clinic_id, professional_id)");
    expect(schema).toContain("foreign key (clinic_id, procedure_id)");
    for (const index of schema.matchAll(/create (?:unique )?index [^\n]+\n?\s*on public\.[^(]+ \(([^)]+)/g)) {
      expect(index[1]?.trim()).toMatch(/^clinic_id/);
    }
  });

  it("congela preço/duração no banco e exige exatamente uma origem de procedimento", () => {
    expect(schema).toContain("price_cents between 0 and 9007199254740991");
    expect(schema).toContain("duration_minutes between 5 and 1440");
    expect(schema).toContain("appointments_procedure_source_check");
    expect(schema).toContain("appointments_clinic_creation_idempotency_idx");
  });

  it("bloqueia overlap por profissional sem extensão e ignora cancelados", () => {
    const overlap = schema.split("create function app_private.prevent_appointment_overlap")[1]!;
    expect(overlap).toContain("pg_advisory_xact_lock");
    expect(overlap).toContain("if new.status = 'canceled' then return new; end if");
    expect(overlap).toContain("appointment.status <> 'canceled'");
    expect(schema).not.toContain("create extension");
  });

  it("registra o catálogo de permissões da agenda por papel", () => {
    expect(permissions).toContain("('appointment.view')");
    expect(permissions).toContain("('appointment.manage')");
    expect(permissions).toContain("('receptionist', 'appointment.manage')");
    expect(permissions).toContain("('viewer', 'appointment.view')");
    expect(permissions).not.toContain("('viewer', 'appointment.manage')");
    expect(permissions).not.toContain("('professional', 'appointment.manage')");
  });

  it("endurece as três mutações com autorização, AAL2 e grants mínimos", () => {
    const created = [...rpcs.matchAll(/create function public\.([a-z_]+)/g)]
      .map((match) => match[1]);
    expect(created).toEqual(mutations);
    for (const mutation of mutations) {
      const body = rpcs.split(`create function public.${mutation}`)[1]!;
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = ''");
      expect(body).toContain("app_private.is_clinic_member(clinic_id)");
      expect(body).toContain("app_private.has_permission(clinic_id, 'appointment.manage')");
      expect(body).toContain("app_private.require_aal2()");
      expect(rpcs).toContain(`revoke all on function public.${mutation}`);
    }
    expect(rpcs).not.toMatch(/delete from public\.appointments/);
  });

  it("mantém cancelamento terminal e concorrência otimista", () => {
    expect(rpcs).toContain("errcode = 'p4312'");
    expect(rpcs.match(/appointment version conflict/g)!.length).toBeGreaterThanOrEqual(4);
    expect(rpcs).toContain("app_private.log_audit_event");
  });
});
