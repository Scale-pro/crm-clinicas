-- F1.6 — requisito de MFA e prova de AAL2 em escrita sensível.

create function public.current_user_requires_mfa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      exists (
        select 1
        from public.platform_admins as pa
        where pa.user_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.clinic_members as cm
        join public.clinics as c on c.id = cm.clinic_id
        where cm.user_id = (select auth.uid())
          and cm.status = 'active'
          and cm.role in ('owner', 'admin')
          and c.status = 'active'
          and c.deleted_at is null
      )
    );
$$;
alter function public.current_user_requires_mfa() owner to postgres;
revoke all on function public.current_user_requires_mfa() from public, anon;
grant execute on function public.current_user_requires_mfa() to authenticated;

create function public.update_clinic_settings(
  clinic_id uuid,
  clinic_name text,
  clinic_timezone text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  -- Primeira validação da operação, independentemente do papel.
  perform app_private.require_aal2();

  if not app_private.has_permission(clinic_id, 'clinic.manage') then
    raise exception using errcode = '42501', message = 'operation not allowed';
  end if;

  if clinic_name is null
    or char_length(trim(clinic_name)) not between 2 and 160
    or clinic_timezone is null
    or not public.is_valid_iana_timezone(clinic_timezone)
  then
    raise exception using errcode = '22023', message = 'invalid clinic data';
  end if;

  select jsonb_build_object(
      'name', c.name,
      'timezone', c.timezone
    )
    into v_before
  from public.clinics as c
  where c.id = clinic_id
    and c.status = 'active'
    and c.deleted_at is null
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'operation not allowed';
  end if;

  update public.clinics as c
  set name = trim(clinic_name),
      timezone = clinic_timezone
  where c.id = clinic_id;

  perform app_private.log_activity(
    clinic_id,
    'clinic.settings_updated',
    '{}'::jsonb
  );
  perform app_private.log_audit_event(
    clinic_id,
    'clinic.settings_updated',
    'clinic',
    clinic_id,
    v_before,
    jsonb_build_object(
      'name', trim(clinic_name),
      'timezone', clinic_timezone
    ),
    null
  );

  return true;
end;
$$;
alter function public.update_clinic_settings(uuid, text, text) owner to postgres;
revoke all on function public.update_clinic_settings(uuid, text, text)
  from public, anon;
grant execute on function public.update_clinic_settings(uuid, text, text)
  to authenticated;
