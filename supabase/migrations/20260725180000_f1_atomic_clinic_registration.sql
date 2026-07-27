-- F1.5 — onboarding inicial atômico, idempotente e sem service role.

-- Suplementar: garante uma única clínica de onboarding ativa por criador e
-- fecha a corrida mesmo fora do caminho normal da RPC.
create unique index clinics_one_active_onboarding_per_creator_idx
  on public.clinics (created_by)
  where deleted_at is null;
comment on index public.clinics_one_active_onboarding_per_creator_idx is
  'Suplementar: idempotência do onboarding inicial por usuário autenticado.';

create function public.create_clinic_with_owner(
  clinic_name text,
  clinic_slug text,
  clinic_timezone text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_clinic_id uuid;
  v_email_confirmed_at timestamptz;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select u.email_confirmed_at
    into v_email_confirmed_at
  from auth.users as u
  where u.id = v_actor_id
    and u.deleted_at is null;

  if not found or v_email_confirmed_at is null then
    raise exception using errcode = '42501', message = 'confirmed account required';
  end if;

  if clinic_name is null
    or char_length(trim(clinic_name)) not between 2 and 160
    or clinic_slug is null
    or clinic_slug <> lower(clinic_slug)
    or clinic_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or char_length(clinic_slug) not between 3 and 80
    or clinic_timezone is null
    or not public.is_valid_iana_timezone(clinic_timezone)
  then
    raise exception using errcode = '22023', message = 'invalid clinic data';
  end if;

  -- Serializa duplo-submit e chamadas concorrentes do mesmo usuário.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor_id::text, 0)
  );

  select c.id
    into v_clinic_id
  from public.clinics as c
  where c.created_by = v_actor_id
    and c.deleted_at is null
  order by c.created_at, c.id
  limit 1;

  if found then
    if exists (
      select 1
      from public.clinics as c
      join public.clinic_members as cm on cm.clinic_id = c.id
      where c.id = v_clinic_id
        and c.status = 'active'
        and cm.user_id = v_actor_id
        and cm.role = 'owner'
        and cm.status = 'active'
    ) then
      return v_clinic_id;
    end if;

    raise exception using
      errcode = '55000',
      message = 'clinic onboarding unavailable';
  end if;

  insert into public.clinics (
    name,
    slug,
    timezone,
    created_by
  )
  values (
    trim(clinic_name),
    clinic_slug,
    clinic_timezone,
    v_actor_id
  )
  returning id into v_clinic_id;

  insert into public.clinic_members (clinic_id, user_id, role, status)
  values (v_clinic_id, v_actor_id, 'owner', 'active');

  insert into public.clinic_features (clinic_id, feature_key, enabled, config)
  values
    (v_clinic_id, 'team_management', true, '{}'::jsonb),
    (v_clinic_id, 'audit_history', true, '{}'::jsonb);

  insert into public.clinic_limits (clinic_id, limit_key, limit_value)
  values
    (v_clinic_id, 'members', 25),
    (v_clinic_id, 'pending_invitations', 25);

  perform app_private.log_activity(
    v_clinic_id,
    'clinic.created',
    jsonb_build_object('role', 'owner')
  );
  perform app_private.log_audit_event(
    v_clinic_id,
    'clinic.created',
    'clinic',
    v_clinic_id,
    null,
    jsonb_build_object(
      'name', trim(clinic_name),
      'slug', clinic_slug,
      'timezone', clinic_timezone,
      'status', 'active'
    ),
    null
  );

  return v_clinic_id;
exception
  when unique_violation or check_violation or foreign_key_violation then
    raise exception using
      errcode = '22023',
      message = 'clinic onboarding unavailable';
end;
$$;
alter function public.create_clinic_with_owner(text, text, text) owner to postgres;
revoke all on function public.create_clinic_with_owner(text, text, text)
  from public, anon;
grant execute on function public.create_clinic_with_owner(text, text, text)
  to authenticated;
