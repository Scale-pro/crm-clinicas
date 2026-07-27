-- F1.8 — suporte de plataforma isolado, temporário, read_only e auditado.

create function app_private.require_support_read(
  p_clinic_id uuid,
  p_grant_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app_private.require_aal2();
  if not app_private.is_platform_admin()
    or not exists (
      select 1 from public.support_grants as sg
      where sg.id = p_grant_id
        and sg.clinic_id = p_clinic_id
        and sg.admin_user_id = (select auth.uid())
        and sg.access_level = 'read_only'::public.support_access_level
        and sg.revoked_at is null
        and sg.expires_at > statement_timestamp()
    )
  then
    raise exception using errcode = '42501', message = 'support access denied';
  end if;
end;
$$;
alter function app_private.require_support_read(uuid, uuid) owner to postgres;
revoke all on function app_private.require_support_read(uuid, uuid)
  from public, anon, authenticated;

create function public.create_support_grant(
  clinic_id uuid,
  access_level public.support_access_level,
  reason text,
  expires_at timestamptz
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare v_id uuid;
begin
  perform app_private.require_aal2();
  if not app_private.is_platform_admin()
    or access_level <> 'read_only'::public.support_access_level
    or char_length(trim(reason)) not between 10 and 1000
    or expires_at <= statement_timestamp()
    or expires_at > statement_timestamp() + interval '24 hours'
    or not exists (
      select 1 from public.clinics as c
      where c.id = clinic_id and c.status = 'active' and c.deleted_at is null
    )
  then
    raise exception using errcode = '42501', message = 'operation not allowed';
  end if;
  insert into public.support_grants (
    admin_user_id, clinic_id, access_level, reason, expires_at
  ) values (
    (select auth.uid()), clinic_id, 'read_only', trim(reason), expires_at
  ) returning id into v_id;
  perform app_private.log_audit_event(
    clinic_id, 'support.grant_created', 'support_grant', v_id, null,
    jsonb_build_object('access_level', 'read_only', 'expires_at', expires_at),
    v_id
  );
  return v_id;
end;
$$;
alter function public.create_support_grant(
  uuid, public.support_access_level, text, timestamptz
) owner to postgres;
revoke all on function public.create_support_grant(
  uuid, public.support_access_level, text, timestamptz
) from public, anon;
grant execute on function public.create_support_grant(
  uuid, public.support_access_level, text, timestamptz
) to authenticated;

create function public.revoke_support_grant(grant_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_clinic_id uuid;
begin
  perform app_private.require_aal2();
  if not app_private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'operation not allowed';
  end if;
  select sg.clinic_id into v_clinic_id
  from public.support_grants as sg
  where sg.id = grant_id
    and sg.admin_user_id = (select auth.uid())
    and sg.revoked_at is null
    and sg.expires_at > statement_timestamp()
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'operation not allowed';
  end if;
  perform app_private.log_audit_event(
    v_clinic_id, 'support.grant_revoked', 'support_grant', grant_id,
    jsonb_build_object('status', 'active'),
    jsonb_build_object('status', 'revoked'), grant_id
  );
  update public.support_grants as sg
  set revoked_at = statement_timestamp(), revoked_by = (select auth.uid())
  where sg.id = grant_id;
  return true;
end;
$$;
alter function public.revoke_support_grant(uuid) owner to postgres;
revoke all on function public.revoke_support_grant(uuid) from public, anon;
grant execute on function public.revoke_support_grant(uuid) to authenticated;

create function public.platform_list_clinics()
returns table (
  clinic_id uuid, name text, slug text, timezone text, status text,
  created_at timestamptz
)
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform app_private.require_aal2();
  if not app_private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'operation not allowed';
  end if;
  perform app_private.log_audit_event(
    null, 'support.list_clinics', 'platform', null, null, null, null
  );
  return query select c.id, c.name, c.slug, c.timezone, c.status, c.created_at
  from public.clinics as c where c.deleted_at is null order by c.created_at, c.id;
end;
$$;
alter function public.platform_list_clinics() owner to postgres;
revoke all on function public.platform_list_clinics() from public, anon;
grant execute on function public.platform_list_clinics() to authenticated;

create function public.platform_read_clinic_members(clinic_id uuid, grant_id uuid)
returns table (
  member_id uuid, user_id uuid, role text, status text, created_at timestamptz
)
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform app_private.require_support_read(clinic_id, grant_id);
  perform app_private.log_audit_event(
    clinic_id, 'support.read_members', 'clinic', clinic_id,
    null, null, grant_id
  );
  return query select cm.id, cm.user_id, cm.role, cm.status, cm.created_at
  from public.clinic_members as cm
  where cm.clinic_id = platform_read_clinic_members.clinic_id
  order by cm.created_at, cm.id;
end;
$$;
alter function public.platform_read_clinic_members(uuid, uuid) owner to postgres;
revoke all on function public.platform_read_clinic_members(uuid, uuid)
  from public, anon;
grant execute on function public.platform_read_clinic_members(uuid, uuid)
  to authenticated;

create function public.platform_read_clinic_invitations(
  clinic_id uuid, grant_id uuid
)
returns table (
  invitation_id uuid, email text, role text, status text,
  expires_at timestamptz, created_at timestamptz
)
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform app_private.require_support_read(clinic_id, grant_id);
  perform app_private.log_audit_event(
    clinic_id, 'support.read_invitations', 'clinic', clinic_id,
    null, null, grant_id
  );
  return query select i.id, i.email, i.role, i.status, i.expires_at, i.created_at
  from public.invitations as i
  where i.clinic_id = platform_read_clinic_invitations.clinic_id
  order by i.created_at, i.id;
end;
$$;
alter function public.platform_read_clinic_invitations(uuid, uuid) owner to postgres;
revoke all on function public.platform_read_clinic_invitations(uuid, uuid)
  from public, anon;
grant execute on function public.platform_read_clinic_invitations(uuid, uuid)
  to authenticated;

create function public.platform_read_clinic_configuration(
  clinic_id uuid, grant_id uuid
)
returns table (
  kind text, key text, enabled boolean, config jsonb, limit_value bigint
)
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform app_private.require_support_read(clinic_id, grant_id);
  perform app_private.log_audit_event(
    clinic_id, 'support.read_configuration', 'clinic', clinic_id,
    null, null, grant_id
  );
  return query
    select 'feature'::text, cf.feature_key, cf.enabled, cf.config, null::bigint
    from public.clinic_features as cf
    where cf.clinic_id = platform_read_clinic_configuration.clinic_id
    union all
    select 'limit'::text, cl.limit_key, null::boolean, null::jsonb, cl.limit_value
    from public.clinic_limits as cl
    where cl.clinic_id = platform_read_clinic_configuration.clinic_id;
end;
$$;
alter function public.platform_read_clinic_configuration(uuid, uuid)
  owner to postgres;
revoke all on function public.platform_read_clinic_configuration(uuid, uuid)
  from public, anon;
grant execute on function public.platform_read_clinic_configuration(uuid, uuid)
  to authenticated;

create function public.platform_read_clinic_audit(clinic_id uuid, grant_id uuid)
returns table (
  audit_id uuid, actor_id uuid, action text, entity text, entity_id uuid,
  occurred_at timestamptz, via text
)
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform app_private.require_support_read(clinic_id, grant_id);
  perform app_private.log_audit_event(
    clinic_id, 'support.read_audit', 'clinic', clinic_id,
    null, null, grant_id
  );
  return query select
    al.id, al.actor_id, al.action, al.entity, al.entity_id, al.occurred_at, al.via
  from public.audit_logs as al
  where al.clinic_id = platform_read_clinic_audit.clinic_id
  order by al.occurred_at desc, al.id
  limit 200;
end;
$$;
alter function public.platform_read_clinic_audit(uuid, uuid) owner to postgres;
revoke all on function public.platform_read_clinic_audit(uuid, uuid)
  from public, anon;
grant execute on function public.platform_read_clinic_audit(uuid, uuid)
  to authenticated;
