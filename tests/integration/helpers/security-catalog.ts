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
] as const;

export type SecurityCatalogViolation = {
  invariant: "append_only" | "force_rls" | "public_execute" | "rls" | "search_path";
  object: string;
};

export async function findSecurityCatalogViolations(
  database: Pick<PoolClient, "query">,
): Promise<SecurityCatalogViolation[]> {
  const violations: SecurityCatalogViolation[] = [];

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
       and c.relname = any(array['activities', 'audit_logs'])
       and p.polcmd in ('*', 'w', 'd')
     order by c.relname, p.polname`,
  );
  for (const policy of policies.rows) {
    violations.push({
      invariant: "append_only",
      object: `${policy.table_name}.${policy.policy_name}`,
    });
  }

  return violations;
}
