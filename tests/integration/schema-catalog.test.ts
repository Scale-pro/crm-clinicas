import { afterAll, describe, expect, it } from "vitest";

import { createTestAdminClient } from "./helpers/create-test-admin-client";
import { createTestDbPool } from "./helpers/create-test-db-client";

const TABLES = [
  "profiles",
  "clinics",
  "clinic_members",
  "roles",
  "permissions",
  "role_permissions",
  "invitations",
  "clinic_features",
  "clinic_limits",
  "platform_admins",
  "support_grants",
  "activities",
  "audit_logs",
  "contacts",
  "person_contacts",
  "patients",
  "lead_sources",
  "pipelines",
  "pipeline_stages",
  "opportunities",
  "opportunity_stage_events",
  "professionals",
  "professional_specialties",
  "procedures",
  "professional_procedures",
  "professional_weekly_availability",
  "whatsapp_accounts",
  "whatsapp_webhook_events",
  "conversations",
  "messages",
  "message_status_events",
  "conversation_assignments",
  "message_delivery_attempts",
  "appointments",
] as const;

const pool = createTestDbPool();
afterAll(() => pool.end());

describe("catálogo do schema F4 e núcleo WhatsApp", () => {
  it("contém exatamente as 34 tabelas públicas aprovadas", async () => {
    const { rows } = await pool.query<{ tablename: string }>(
      `select tablename
       from pg_catalog.pg_tables
       where schemaname = 'public'
       order by tablename`,
    );
    expect(rows.map((row) => row.tablename)).toEqual([...TABLES].sort());
  });

  it("mantém ENABLE e FORCE RLS nas 34 tabelas", async () => {
    const { rows } = await pool.query<{
      relname: string;
      relforcerowsecurity: boolean;
      relrowsecurity: boolean;
    }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = any($1::text[])
       order by c.relname`,
      [TABLES],
    );

    expect(rows).toHaveLength(34);
    expect(rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(
      true,
    );
  });

  it("mantém clinic_id como primeira coluna nos índices compostos de tenant", async () => {
    const expectedIndexes = [
      "activities_clinic_occurred_idx",
      "audit_logs_clinic_occurred_idx",
      "clinic_members_clinic_user_idx",
      "invitations_clinic_status_idx",
      "support_grants_clinic_expiry_idx",
      "contacts_clinic_created_idx",
      "contacts_clinic_owner_active_idx",
      "contacts_clinic_name_idx",
      "person_contacts_clinic_value_idx",
      "person_contacts_clinic_contact_kind_idx",
      "patients_clinic_became_idx",
      "lead_sources_clinic_name_idx",
      "activities_clinic_contact_occurred_idx",
      "pipelines_clinic_default_idx",
      "pipeline_stages_clinic_pipeline_position_idx",
      "opportunities_clinic_stage_board_idx",
      "opportunities_clinic_status_updated_idx",
      "opportunities_clinic_assignee_open_idx",
      "opportunities_clinic_contact_idx",
      "opportunities_clinic_pipeline_status_idx",
      "opportunity_stage_events_clinic_opportunity_occurred_idx",
      "activities_clinic_opportunity_occurred_idx",
      "professionals_clinic_status_name_idx",
      "professional_specialties_clinic_search_idx",
      "procedures_clinic_status_name_idx",
      "professional_procedures_clinic_professional_idx",
      "professional_procedures_clinic_procedure_idx",
      "professional_weekly_availability_clinic_professional_idx",
      "whatsapp_accounts_clinic_status_idx",
      "whatsapp_webhook_events_clinic_status_retry_idx",
      "conversations_clinic_state_last_idx",
      "conversations_clinic_assignee_state_idx",
      "conversations_clinic_unread_idx",
      "messages_clinic_conversation_occurred_idx",
      "messages_clinic_contact_occurred_idx",
      "message_status_events_clinic_message_occurred_idx",
      "conversation_assignments_clinic_conversation_created_idx",
      "message_delivery_attempts_clinic_message_attempt_idx",
      "appointments_clinic_start_idx",
      "appointments_clinic_professional_start_idx",
      "appointments_clinic_contact_start_idx",
    ];
    const { rows } = await pool.query<{ first_column: string; index_name: string }>(
      `select index_class.relname as index_name,
              attribute.attname as first_column
       from pg_catalog.pg_index index_catalog
       join pg_catalog.pg_class index_class on index_class.oid = index_catalog.indexrelid
       join pg_catalog.pg_class table_class on table_class.oid = index_catalog.indrelid
       join pg_catalog.pg_namespace namespace on namespace.oid = table_class.relnamespace
       join pg_catalog.pg_attribute attribute
         on attribute.attrelid = table_class.oid
        and attribute.attnum = index_catalog.indkey[0]
       where namespace.nspname = 'public'
         and index_class.relname = any($1::text[])
       order by index_class.relname`,
      [expectedIndexes],
    );

    expect(rows).toEqual(
      expectedIndexes.sort().map((indexName) => ({
        first_column: "clinic_id",
        index_name: indexName,
      })),
    );
  });

  it("semeia exatamente a matriz de papéis e permissões até a F4", async () => {
    const roles = await pool.query<{ key: string }>(
      "select key from public.roles order by key",
    );
    const permissions = await pool.query<{ key: string }>(
      "select key from public.permissions order by key",
    );
    const matrix = await pool.query<{ permission: string; role: string }>(
      "select role, permission from public.role_permissions order by role, permission",
    );

    expect(roles.rows.map((row) => row.key)).toEqual(
      ["admin", "manager", "owner", "professional", "receptionist", "sdr", "viewer"],
    );
    expect(permissions.rows.map((row) => row.key)).toEqual(
      [
        "appointment.manage",
        "appointment.view",
        "audit.view",
        "clinic.manage",
        "contact.archive",
        "contact.create",
        "contact.edit_all",
        "contact.edit_own",
        "contact.view_all",
        "contact.view_own",
        "conversation.assign",
        "conversation.manage",
        "conversation.send",
        "conversation.view_all",
        "conversation.view_own",
        "lead_source.manage",
        "member.invite",
        "member.manage",
        "member.remove",
        "opportunity.close",
        "opportunity.create",
        "opportunity.edit_all",
        "opportunity.edit_own",
        "opportunity.move_all",
        "opportunity.move_own",
        "opportunity.reopen",
        "opportunity.view_all",
        "opportunity.view_own",
        "pipeline.manage",
        "procedure.manage",
        "procedure.view",
        "professional.manage",
        "professional.view",
      ],
    );
    expect(permissions.rows).toHaveLength(33);
    // 94 da F2.3.1 + 12 da agenda (view+manage para owner, admin, manager,
    // recepção e SDR; só view para profissional e viewer) + 22 do núcleo
    // WhatsApp (5 conversation.* para owner/admin/manager, 2 para SDR, 3 para
    // recepção, 1 para profissional, 1 para viewer).
    expect(matrix.rows).toHaveLength(128);
  });

  it("cria profile automaticamente após criação no Auth", async () => {
    const admin = createTestAdminClient();
    const email = `profile-${crypto.randomUUID()}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: "Local-only-test-password-123!",
      user_metadata: { full_name: "Usuário Fictício" },
    });
    expect(error).toBeNull();

    try {
      const profile = await pool.query<{ full_name: string }>(
        "select full_name from public.profiles where user_id = $1",
        [data.user?.id],
      );
      expect(profile.rows).toEqual([{ full_name: "Usuário Fictício" }]);
    } finally {
      if (data.user) await admin.auth.admin.deleteUser(data.user.id);
    }
  });

  it("declara o ordenamento nativo correto do enum de suporte", async () => {
    const { rows } = await pool.query<{ enumlabel: string }>(
      `select e.enumlabel
       from pg_catalog.pg_enum e
       join pg_catalog.pg_type t on t.oid = e.enumtypid
       join pg_catalog.pg_namespace n on n.oid = t.typnamespace
       where n.nspname = 'public' and t.typname = 'support_access_level'
       order by e.enumsortorder`,
    );
    expect(rows.map((row) => row.enumlabel)).toEqual([
      "read_only",
      "support_operations",
      "restricted_write",
    ]);
  });
});
