import type { PoolClient } from "pg";

const REQUIRED_TABLES = [
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

const TENANT_WRITE_TABLES = [
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

export type SecurityCatalogViolation = {
  invariant:
    | "append_only"
    | "force_rls"
    | "public_execute"
    | "rls"
    | "search_path"
    | "tenant_catalog"
    | "tenant_direct_write";
  object: string;
};

function isTenantScoped(expression: string | null): boolean {
  if (!expression) return false;
  const normalized = expression.toLowerCase();
  return normalized.includes("clinic_id") &&
    /(auth\.uid|current_user_clinic_ids|has_permission)/.test(normalized);
}

export async function findSecurityCatalogViolations(
  database: Pick<PoolClient, "query">,
): Promise<SecurityCatalogViolation[]> {
  const violations: SecurityCatalogViolation[] = [];

  const tenantTables = await database.query<{ table_name: string }>(
    `select table_name
     from information_schema.columns
     where table_schema = 'public' and column_name = 'clinic_id'
     order by table_name`,
  );
  const actualTenantTables = tenantTables.rows.map((row) => row.table_name);
  const catalogTenantTables = [...TENANT_WRITE_TABLES].sort();
  if (JSON.stringify(actualTenantTables) !== JSON.stringify(catalogTenantTables)) {
    violations.push({
      invariant: "tenant_catalog",
      object: `expected=${catalogTenantTables.join(",")};actual=${actualTenantTables.join(",")}`,
    });
  }

  const tables = await database.query<{
    relforcerowsecurity: boolean;
    relname: string;
    relrowsecurity: boolean;
  }>(
    `select c.relname, c.relrowsecurity, c.relforcerowsecurity
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = any($1::text[])
     order by c.relname`,
    [REQUIRED_TABLES],
  );
  const byName = new Map(tables.rows.map((table) => [table.relname, table]));
  for (const tableName of REQUIRED_TABLES) {
    const table = byName.get(tableName);
    if (!table?.relrowsecurity) violations.push({ invariant: "rls", object: tableName });
    if (!table?.relforcerowsecurity) {
      violations.push({ invariant: "force_rls", object: tableName });
    }
  }

  const routines = await database.query<{
    identity_arguments: string;
    public_execute: boolean;
    proname: string;
    proconfig: string[] | null;
    schema_name: string;
  }>(
    `select n.nspname as schema_name,
            p.proname,
            pg_get_function_identity_arguments(p.oid) as identity_arguments,
            p.proconfig,
            exists (
              select 1
              from pg_catalog.aclexplode(
                coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
              ) as privilege
              where privilege.grantee = 0
                and privilege.privilege_type = 'EXECUTE'
            ) as public_execute
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('app_private', 'public') and p.prosecdef
     order by n.nspname, p.proname, identity_arguments`,
  );
  for (const routine of routines.rows) {
    const name = `${routine.schema_name}.${routine.proname}(${routine.identity_arguments})`;
    if (!routine.proconfig?.includes('search_path=""')) {
      violations.push({ invariant: "search_path", object: name });
    }
    if (routine.public_execute) {
      violations.push({ invariant: "public_execute", object: name });
    }
  }

  const policies = await database.query<{ policy_name: string; table_name: string }>(
    `select c.relname as table_name, p.polname as policy_name
     from pg_catalog.pg_policy p
     join pg_catalog.pg_class c on c.oid = p.polrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = any(array['activities', 'audit_logs', 'opportunity_stage_events'])
       and p.polcmd in ('*', 'w', 'd')
     order by c.relname, p.polname`,
  );
  for (const policy of policies.rows) {
    violations.push({
      invariant: "append_only",
      object: `${policy.table_name}.${policy.policy_name}`,
    });
  }


  const directWrites = await database.query<{
    command: "DELETE" | "INSERT" | "UPDATE";
    table_name: string;
  }>(
    `select table_name, command
     from unnest($1::text[]) as tenant_tables(table_name)
     cross join unnest(array['INSERT', 'UPDATE', 'DELETE']) as commands(command)
     where has_table_privilege(
       'authenticated', format('public.%I', table_name), command
     )
     order by table_name, command`,
    [TENANT_WRITE_TABLES],
  );
  const writePolicies = await database.query<{
    applies_to_authenticated: boolean;
    command: "ALL" | "DELETE" | "INSERT" | "UPDATE";
    table_name: string;
    using_expression: string | null;
    with_check_expression: string | null;
  }>(
    `select c.relname as table_name,
            case p.polcmd
              when '*' then 'ALL'
              when 'a' then 'INSERT'
              when 'w' then 'UPDATE'
              when 'd' then 'DELETE'
            end as command,
            0 = any(p.polroles)
              or (select oid from pg_catalog.pg_roles where rolname = 'authenticated')
                 = any(p.polroles) as applies_to_authenticated,
            pg_catalog.pg_get_expr(p.polqual, p.polrelid) as using_expression,
            pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) as with_check_expression
     from pg_catalog.pg_policy p
     join pg_catalog.pg_class c on c.oid = p.polrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = any($1::text[])
       and p.polcmd in ('*', 'a', 'w', 'd')
     order by c.relname, p.polname`,
    [TENANT_WRITE_TABLES],
  );

  for (const grant of directWrites.rows) {
    const corresponding = writePolicies.rows.filter(
      (policy) =>
        policy.table_name === grant.table_name &&
        policy.applies_to_authenticated &&
        (policy.command === grant.command || policy.command === "ALL"),
    );
    const safe = corresponding.length > 0 && corresponding.every((policy) => {
      if (policy.command !== grant.command) return false;
      if (grant.command === "INSERT") {
        return isTenantScoped(policy.with_check_expression);
      }
      if (grant.command === "UPDATE") {
        return isTenantScoped(policy.using_expression) &&
          isTenantScoped(policy.with_check_expression);
      }
      return isTenantScoped(policy.using_expression);
    });
    if (!safe) {
      violations.push({
        invariant: "tenant_direct_write",
        object: `${grant.table_name}.${grant.command}`,
      });
    }
  }

  return violations;
}
