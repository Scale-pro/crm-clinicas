import { afterAll, describe, expect, it } from "vitest";

import { createTestDbPool } from "./helpers/create-test-db-client";
import { findSecurityCatalogViolations } from "./helpers/security-catalog";

const pool = createTestDbPool();
afterAll(() => pool.end());

const EXPECTED_POLICIES = [
  ["activities", "activities_select", "SELECT"],
  ["audit_logs", "audit_logs_select", "SELECT"],
  ["clinic_features", "clinic_features_select", "SELECT"],
  ["clinic_limits", "clinic_limits_select", "SELECT"],
  ["clinic_members", "clinic_members_select", "SELECT"],
  ["clinics", "clinics_select", "SELECT"],
  ["contacts", "contacts_select", "SELECT"],
  ["invitations", "invitations_select", "SELECT"],
  ["lead_sources", "lead_sources_select", "SELECT"],
  ["opportunities", "opportunities_select", "SELECT"],
  ["opportunity_stage_events", "opportunity_stage_events_select", "SELECT"],
  ["patients", "patients_select", "SELECT"],
  ["permissions", "permissions_select", "SELECT"],
  ["person_contacts", "person_contacts_select", "SELECT"],
  ["pipeline_stages", "pipeline_stages_select", "SELECT"],
  ["pipelines", "pipelines_select", "SELECT"],
  ["profiles", "profiles_select", "SELECT"],
  ["profiles", "profiles_update", "UPDATE"],
  ["role_permissions", "role_permissions_select", "SELECT"],
  ["roles", "roles_select", "SELECT"],
] as const;

describe("catálogo de autorização e RLS", () => {
  it("não possui violações nos invariantes mutáveis de segurança", async () => {
    expect(await findSecurityCatalogViolations(pool)).toEqual([]);
  });

  it("possui exatamente as políticas separadas aprovadas até a F2.2", async () => {
    const { rows } = await pool.query<{
      cmd: string;
      policyname: string;
      tablename: string;
      with_check: string | null;
    }>(
      `select tablename, policyname, cmd, with_check
       from pg_catalog.pg_policies
       where schemaname = 'public'
       order by tablename, policyname`,
    );

    expect(rows.map(({ tablename, policyname, cmd }) => [tablename, policyname, cmd]))
      .toEqual(EXPECTED_POLICIES);
    expect(rows.some((row) => row.cmd === "ALL")).toBe(false);
    expect(
      rows
        .filter((row) => row.cmd === "INSERT" || row.cmd === "UPDATE")
        .every((row) => row.with_check !== null),
    ).toBe(true);
  });

  it("não permite escrita direta nas tabelas append-only", async () => {
    const { rows } = await pool.query<{
      can_delete: boolean;
      can_insert: boolean;
      can_update: boolean;
      table_name: string;
    }>(
      `select table_name,
              has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT') as can_insert,
              has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE') as can_update,
              has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') as can_delete
       from unnest(array['activities', 'audit_logs', 'opportunity_stage_events']) as names(table_name)
       order by table_name`,
    );

    expect(rows).toEqual([
      {
        can_delete: false,
        can_insert: false,
        can_update: false,
        table_name: "activities",
      },
      {
        can_delete: false,
        can_insert: false,
        can_update: false,
        table_name: "audit_logs",
      },
      {
        can_delete: false,
        can_insert: false,
        can_update: false,
        table_name: "opportunity_stage_events",
      },
    ]);
  });

  it("mantém escrita das tabelas de tenant exclusivamente por RPC", async () => {
    const tenantTables = [
      "activities",
      "audit_logs",
      "clinic_features",
      "clinic_limits",
      "clinic_members",
      "invitations",
      "support_grants",
      "contacts",
      "person_contacts",
      "patients",
      "lead_sources",
      "pipelines",
      "pipeline_stages",
      "opportunities",
      "opportunity_stage_events",
    ];
    const { rows } = await pool.query<{
      can_delete: boolean;
      can_insert: boolean;
      can_update: boolean;
      table_name: string;
    }>(
      `select table_name,
              has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT') as can_insert,
              has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE') as can_update,
              has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') as can_delete
       from unnest($1::text[]) as names(table_name)
       order by table_name`,
      [tenantTables],
    );
    expect(rows).toHaveLength(tenantTables.length);
    for (const row of rows) {
      expect(row.can_delete).toBe(false);
      expect(row.can_insert).toBe(false);
      expect(row.can_update).toBe(false);
    }
  });

  it("nega uso de app_private e execução direta de log_audit_event", async () => {
    const { rows } = await pool.query<{
      anon_audit: boolean;
      anon_schema: boolean;
      authenticated_audit: boolean;
      authenticated_schema: boolean;
    }>(
      `select
         has_schema_privilege('anon', 'app_private', 'USAGE') as anon_schema,
         has_schema_privilege('authenticated', 'app_private', 'USAGE') as authenticated_schema,
         has_function_privilege(
           'anon',
           'app_private.log_audit_event(uuid,text,text,uuid,jsonb,jsonb,uuid)',
           'EXECUTE'
         ) as anon_audit,
         has_function_privilege(
           'authenticated',
           'app_private.log_audit_event(uuid,text,text,uuid,jsonb,jsonb,uuid)',
           'EXECUTE'
         ) as authenticated_audit`,
    );

    expect(rows).toEqual([
      {
        anon_audit: false,
        anon_schema: false,
        authenticated_audit: false,
        authenticated_schema: false,
      },
    ]);
  });

  it("fixa owner, search_path e grants de toda SECURITY DEFINER", async () => {
    const { rows } = await pool.query<{
      anon_execute: boolean;
      authenticated_execute: boolean;
      identity_arguments: string;
      owner: string;
      proconfig: string[] | null;
      proname: string;
      schema_name: string;
    }>(
      `select n.nspname as schema_name,
              p.proname,
              pg_get_function_identity_arguments(p.oid) as identity_arguments,
              pg_get_userbyid(p.proowner) as owner,
              p.proconfig,
              has_function_privilege(
                'anon',
                p.oid,
                'EXECUTE'
              ) as anon_execute,
              has_function_privilege(
                'authenticated',
                p.oid,
                'EXECUTE'
              ) as authenticated_execute
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('app_private', 'public')
         and p.prosecdef
       order by n.nspname, p.proname, identity_arguments`,
    );

    expect(rows.length).toBeGreaterThanOrEqual(11);
    for (const routine of rows) {
      expect(routine.owner).toBe("postgres");
      expect(routine.proconfig).toContain('search_path=""');
      expect(routine.anon_execute).toBe(false);

      const isApprovedPublicRpc =
        routine.schema_name === "public" &&
        (routine.proname.startsWith("current_user_") ||
          [
            "accept_invitation",
            "add_contact_method",
            "archive_contact",
            "archive_contact_method",
            "archive_lead_source",
            "archive_pipeline",
            "assign_contact_owner",
            "assign_opportunity",
            "close_opportunity",
            "create_contact",
            "create_lead_source",
            "create_opportunity",
            "create_pipeline",
            "create_pipeline_stage",
            "create_clinic_with_owner",
            "invite_member",
            "create_support_grant",
            "duplicate_pipeline",
            "platform_list_clinics",
            "platform_read_clinic_audit",
            "platform_read_clinic_configuration",
            "platform_read_clinic_invitations",
            "platform_read_clinic_members",
            "link_contact_as_patient",
            "move_opportunity",
            "remove_member",
            "rename_pipeline",
            "reopen_opportunity",
            "reorder_pipeline_stages",
            "revoke_invitation",
            "revoke_support_grant",
            "suspend_member",
            "set_primary_contact_method",
            "set_default_pipeline",
            "unlink_contact_as_patient",
            "update_contact",
            "update_contact_method",
            "update_lead_source",
            "update_clinic_settings",
            "update_member_role",
            "update_opportunity",
            "update_pipeline_stage",
          ].includes(routine.proname));
      expect(routine.authenticated_execute).toBe(isApprovedPublicRpc);
      expect(routine.identity_arguments).not.toMatch(/\buser_id\b/);
    }
  });

  it("mantém a busca do board como leitura invoker em allowlist explícita", async () => {
    const { rows } = await pool.query<{
      anon_execute: boolean;
      authenticated_execute: boolean;
      owner: string;
      proconfig: string[] | null;
      security_definer: boolean;
    }>(
      `select p.prosecdef as security_definer,
              pg_get_userbyid(p.proowner) as owner,
              p.proconfig,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
       from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.oid = 'public.search_opportunity_board(uuid,uuid,text,text,uuid,uuid,integer,integer)'::regprocedure`,
    );
    expect(rows).toEqual([{
      anon_execute: false,
      authenticated_execute: true,
      owner: "postgres",
      proconfig: ['search_path=""'],
      security_definer: false,
    }]);
  });

  it("mantém uma única contacts_select, FORCE RLS e zero escrita direta", async () => {
    const { rows } = await pool.query<{
      can_delete: boolean;
      can_insert: boolean;
      can_update: boolean;
      policy_count: string;
      relforcerowsecurity: boolean;
      relrowsecurity: boolean;
    }>(
      `select c.relrowsecurity,
              c.relforcerowsecurity,
              count(p.oid) filter (where p.polcmd = 'r')::text as policy_count,
              has_table_privilege('authenticated', 'public.contacts', 'INSERT') as can_insert,
              has_table_privilege('authenticated', 'public.contacts', 'UPDATE') as can_update,
              has_table_privilege('authenticated', 'public.contacts', 'DELETE') as can_delete
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       left join pg_catalog.pg_policy p on p.polrelid = c.oid
       where n.nspname = 'public' and c.relname = 'contacts'
       group by c.relrowsecurity, c.relforcerowsecurity`,
    );
    expect(rows).toEqual([{
      can_delete: false,
      can_insert: false,
      can_update: false,
      policy_count: "1",
      relforcerowsecurity: true,
      relrowsecurity: true,
    }]);
  });
});
