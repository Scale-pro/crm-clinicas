-- F1.3 — autorização membership-based, políticas RLS e wrappers mínimos.

create schema app_private authorization postgres;
revoke all on schema app_private from public;
revoke usage on schema app_private from public;
revoke usage on schema app_private from anon;
revoke usage on schema app_private from authenticated;

create function app_private.auth_clinic_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cm.clinic_id
  from public.clinic_members as cm
  join public.clinics as c on c.id = cm.clinic_id
  where cm.user_id = (select auth.uid())
    and cm.status = 'active'
    and c.status = 'active'
    and c.deleted_at is null;
$$;
alter function app_private.auth_clinic_ids() owner to postgres;

create function app_private.is_clinic_member(p_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_clinic_id is not null
    and (select auth.uid()) is not null
    and exists (
      select 1
      from public.clinic_members as cm
      join public.clinics as c on c.id = cm.clinic_id
      where cm.clinic_id = p_clinic_id
        and cm.user_id = (select auth.uid())
        and cm.status = 'active'
        and c.status = 'active'
        and c.deleted_at is null
    );
$$;
alter function app_private.is_clinic_member(uuid) owner to postgres;

create function app_private.has_permission(
  p_clinic_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_clinic_id is not null
    and p_permission_key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'
    and exists (
      select 1
      from public.clinic_members as cm
      join public.clinics as c on c.id = cm.clinic_id
      join public.role_permissions as rp on rp.role = cm.role
      where cm.clinic_id = p_clinic_id
        and cm.user_id = (select auth.uid())
        and cm.status = 'active'
        and c.status = 'active'
        and c.deleted_at is null
        and rp.permission = p_permission_key
    );
$$;
alter function app_private.has_permission(uuid, text) owner to postgres;

create function app_private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.platform_admins as pa
      where pa.user_id = (select auth.uid())
    );
$$;
alter function app_private.is_platform_admin() owner to postgres;

create function app_private.has_active_support_grant(
  p_clinic_id uuid,
  p_min_level public.support_access_level
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_platform_admin()
    and exists (
      select 1
      from public.support_grants as sg
      join public.platform_admins as pa on pa.user_id = sg.admin_user_id
      where sg.admin_user_id = (select auth.uid())
        and sg.clinic_id = p_clinic_id
        and sg.access_level >= p_min_level
        and sg.revoked_at is null
        and sg.expires_at > statement_timestamp()
    );
$$;
alter function app_private.has_active_support_grant(
  uuid,
  public.support_access_level
) owner to postgres;

create function app_private.can_assign_role(
  p_clinic_id uuid,
  p_target_role text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case cm.role
      when 'owner' then p_target_role = any (
        array['admin', 'manager', 'sdr', 'receptionist', 'professional', 'viewer']
      )
      when 'admin' then p_target_role = any (
        array['manager', 'sdr', 'receptionist', 'professional', 'viewer']
      )
      when 'manager' then p_target_role = any (
        array['sdr', 'receptionist', 'professional', 'viewer']
      )
      else false
    end
    from public.clinic_members as cm
    join public.clinics as c on c.id = cm.clinic_id
    where cm.clinic_id = p_clinic_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'active'
      and c.status = 'active'
      and c.deleted_at is null
  ), false);
$$;
alter function app_private.can_assign_role(uuid, text) owner to postgres;

create function app_private.require_aal2()
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception using
      errcode = '42501',
      message = 'additional authentication required';
  end if;
end;
$$;
alter function app_private.require_aal2() owner to postgres;

create function app_private.log_activity(
  p_clinic_id uuid,
  p_type text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_clinic_id is null
    or p_type !~ '^[a-z][a-z0-9_.-]*$'
    or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
  then
    raise exception using errcode = '22023', message = 'invalid activity';
  end if;

  insert into public.activities (clinic_id, actor_id, type, payload)
  values (p_clinic_id, (select auth.uid()), p_type, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;
alter function app_private.log_activity(uuid, text, jsonb) owner to postgres;

create function app_private.log_audit_event(
  p_clinic_id uuid,
  p_action text,
  p_entity text,
  p_entity_id uuid default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_support_grant_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_access_level public.support_access_level;
  v_actor_id uuid := (select auth.uid());
  v_id uuid;
  v_reason text;
  v_via text;
begin
  if p_action !~ '^[a-z][a-z0-9_.-]*$'
    or p_entity !~ '^[a-z][a-z0-9_]*$'
  then
    raise exception using errcode = '22023', message = 'invalid audit event';
  end if;

  if p_support_grant_id is not null then
    select sg.access_level, sg.reason
      into v_access_level, v_reason
    from public.support_grants as sg
    join public.platform_admins as pa on pa.user_id = sg.admin_user_id
    where sg.id = p_support_grant_id
      and sg.admin_user_id = v_actor_id
      and sg.clinic_id = p_clinic_id
      and sg.revoked_at is null
      and sg.expires_at > statement_timestamp();

    if not found then
      raise exception using errcode = '42501', message = 'support access denied';
    end if;
    v_via := 'support';
  elsif v_actor_id is null then
    v_via := 'system';
  else
    v_via := 'user';
  end if;

  insert into public.audit_logs (
    clinic_id,
    actor_id,
    support_grant_id,
    action,
    entity,
    entity_id,
    access_level,
    reason,
    before,
    after,
    via
  )
  values (
    p_clinic_id,
    v_actor_id,
    p_support_grant_id,
    p_action,
    p_entity,
    p_entity_id,
    v_access_level,
    v_reason,
    p_before,
    p_after,
    v_via
  )
  returning id into v_id;
  return v_id;
end;
$$;
alter function app_private.log_audit_event(
  uuid,
  text,
  text,
  uuid,
  jsonb,
  jsonb,
  uuid
) owner to postgres;

revoke all on all functions in schema app_private from public, anon, authenticated;

create function public.current_user_clinic_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.auth_clinic_ids();
$$;
alter function public.current_user_clinic_ids() owner to postgres;
revoke all on function public.current_user_clinic_ids() from public, anon;
grant execute on function public.current_user_clinic_ids() to authenticated;

create function public.current_user_has_permission(
  clinic_id uuid,
  permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.has_permission(clinic_id, permission_key);
$$;
alter function public.current_user_has_permission(uuid, text) owner to postgres;
revoke all on function public.current_user_has_permission(uuid, text) from public, anon;
grant execute on function public.current_user_has_permission(uuid, text) to authenticated;

create function public.current_user_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_platform_admin();
$$;
alter function public.current_user_is_platform_admin() owner to postgres;
revoke all on function public.current_user_is_platform_admin() from public, anon;
grant execute on function public.current_user_is_platform_admin() to authenticated;

create policy profiles_select
on public.profiles
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.clinic_members as colleague
    where colleague.user_id = profiles.user_id
      and colleague.status = 'active'
      and colleague.clinic_id in (select public.current_user_clinic_ids())
  )
);

create policy profiles_update
on public.profiles
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy clinics_select
on public.clinics
for select
to authenticated
using (id in (select public.current_user_clinic_ids()));

create policy clinic_members_select
on public.clinic_members
for select
to authenticated
using (clinic_id in (select public.current_user_clinic_ids()));

create policy roles_select
on public.roles
for select
to authenticated
using (true);

create policy permissions_select
on public.permissions
for select
to authenticated
using (true);

create policy role_permissions_select
on public.role_permissions
for select
to authenticated
using (true);

create policy invitations_select
on public.invitations
for select
to authenticated
using (public.current_user_has_permission(clinic_id, 'member.invite'));

create policy clinic_features_select
on public.clinic_features
for select
to authenticated
using (clinic_id in (select public.current_user_clinic_ids()));

create policy clinic_limits_select
on public.clinic_limits
for select
to authenticated
using (clinic_id in (select public.current_user_clinic_ids()));

create policy activities_select
on public.activities
for select
to authenticated
using (clinic_id in (select public.current_user_clinic_ids()));

create policy audit_logs_select
on public.audit_logs
for select
to authenticated
using (public.current_user_has_permission(clinic_id, 'audit.view'));

grant select on table
  public.profiles,
  public.clinics,
  public.clinic_members,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.invitations,
  public.clinic_features,
  public.clinic_limits,
  public.activities,
  public.audit_logs
to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

revoke all on table public.platform_admins, public.support_grants from authenticated;
