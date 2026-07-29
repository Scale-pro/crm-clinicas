-- F2.3.1 — mutações seguras de profissionais e jornada semanal.

create function public.create_professional(
  clinic_id uuid,
  display_name text,
  email text,
  phone text,
  professional_registration_type text,
  professional_registration_number text,
  color text,
  notes text,
  idempotency_key uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
  v_email text;
  v_existing_id uuid;
  v_id uuid;
  v_phone text;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'professional.manage')
  then
    raise exception using errcode = '42501', message = 'professional access denied';
  end if;
  perform app_private.require_aal2();

  if idempotency_key is null
    or display_name is null or char_length(trim(display_name)) not between 2 and 160
    or color is null or upper(trim(color)) !~ '^#[0-9A-F]{6}$'
    or (professional_registration_type is not null
      and char_length(trim(professional_registration_type)) not between 2 and 40)
    or (professional_registration_number is not null
      and char_length(trim(professional_registration_number)) not between 1 and 80)
    or (notes is not null and char_length(notes) > 2000)
  then
    raise exception using errcode = '22023', message = 'invalid professional';
  end if;

  begin
    v_email := case when email is null then null
      else app_private.normalize_contact_method('email', email) end;
    v_phone := case when phone is null then null
      else app_private.normalize_contact_method('phone', phone) end;
  exception when sqlstate '22023' then
    raise exception using errcode = '22023', message = 'invalid professional';
  end;

  select professional.id into v_existing_id
  from public.professionals as professional
  where professional.clinic_id = clinic_id
    and professional.creation_idempotency_key = idempotency_key;
  if found then return v_existing_id; end if;

  begin
    insert into public.professionals (
      clinic_id, display_name, email, phone, professional_registration_type,
      professional_registration_number, color, notes,
      creation_idempotency_key, created_by, updated_by
    ) values (
      clinic_id, trim(display_name), v_email, v_phone,
      nullif(trim(professional_registration_type), ''),
      nullif(trim(professional_registration_number), ''), upper(trim(color)), notes,
      idempotency_key, v_actor_id, v_actor_id
    ) returning id into v_id;
  exception when unique_violation then
    select professional.id into v_existing_id
    from public.professionals as professional
    where professional.clinic_id = clinic_id
      and professional.creation_idempotency_key = idempotency_key;
    if found then return v_existing_id; end if;
    raise exception using errcode = 'P4303', message = 'professional user already linked';
  end;

  perform app_private.log_audit_event(
    clinic_id, 'professional.created', 'professional', v_id,
    null, jsonb_build_object('version', 1, 'status', 'active'), null
  );
  return v_id;
end;
$$;

create function public.update_professional(
  clinic_id uuid,
  professional_id uuid,
  display_name text,
  email text,
  phone text,
  professional_registration_type text,
  professional_registration_number text,
  color text,
  status text,
  notes text,
  expected_version integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
  v_email text;
  v_new_version integer;
  v_phone text;
  v_professional public.professionals;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'professional.manage')
  then raise exception using errcode = '42501', message = 'professional access denied'; end if;
  perform app_private.require_aal2();

  select professional.* into v_professional
  from public.professionals as professional
  where professional.clinic_id = clinic_id and professional.id = professional_id
  for update;
  if not found then
    raise exception using errcode = 'P4301', message = 'professional not found';
  end if;
  if v_professional.archived_at is not null then
    raise exception using errcode = 'P4302', message = 'professional archived';
  end if;
  if expected_version is null or expected_version < 1
    or display_name is null or char_length(trim(display_name)) not between 2 and 160
    or status not in ('active', 'inactive')
    or color is null or upper(trim(color)) !~ '^#[0-9A-F]{6}$'
    or (professional_registration_type is not null
      and char_length(trim(professional_registration_type)) not between 2 and 40)
    or (professional_registration_number is not null
      and char_length(trim(professional_registration_number)) not between 1 and 80)
    or (notes is not null and char_length(notes) > 2000)
  then raise exception using errcode = '22023', message = 'invalid professional'; end if;
  if v_professional.version <> expected_version then
    raise exception using errcode = 'P4091', message = 'professional version conflict';
  end if;
  begin
    v_email := case when email is null then null
      else app_private.normalize_contact_method('email', email) end;
    v_phone := case when phone is null then null
      else app_private.normalize_contact_method('phone', phone) end;
  exception when sqlstate '22023' then
    raise exception using errcode = '22023', message = 'invalid professional';
  end;

  begin
    update public.professionals as professional set
      display_name = trim(display_name), email = v_email, phone = v_phone,
      professional_registration_type = nullif(trim(professional_registration_type), ''),
      professional_registration_number = nullif(trim(professional_registration_number), ''),
      color = upper(trim(color)), status = status, notes = notes,
      version = professional.version + 1, updated_by = v_actor_id
    where professional.clinic_id = clinic_id and professional.id = professional_id
      and professional.version = expected_version
    returning professional.version into v_new_version;
  exception when unique_violation then
    raise exception using errcode = 'P4303', message = 'professional user already linked';
  end;
  if not found then
    raise exception using errcode = 'P4091', message = 'professional version conflict';
  end if;

  perform app_private.log_audit_event(
    clinic_id, 'professional.updated', 'professional', professional_id,
    jsonb_build_object('version', v_professional.version, 'status', v_professional.status),
    jsonb_build_object(
      'version', v_new_version, 'status', status,
      'contact_fields_changed',
        v_professional.email is distinct from v_email or v_professional.phone is distinct from v_phone,
      'registration_fields_changed',
        v_professional.professional_registration_type is distinct from professional_registration_type
        or v_professional.professional_registration_number is distinct from professional_registration_number
    ), null
  );
  return v_new_version;
end;
$$;

create function public.archive_professional(clinic_id uuid, professional_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
  v_link_id uuid;
  v_professional public.professionals;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'professional.manage')
  then raise exception using errcode = '42501', message = 'professional access denied'; end if;
  perform app_private.require_aal2();
  select professional.* into v_professional
  from public.professionals as professional
  where professional.clinic_id = clinic_id and professional.id = professional_id
  for update;
  if not found then raise exception using errcode = 'P4301', message = 'professional not found'; end if;
  if v_professional.archived_at is not null then return true; end if;

  update public.professionals as professional set
    status = 'inactive', archived_at = statement_timestamp(),
    version = professional.version + 1, updated_by = v_actor_id
  where professional.clinic_id = clinic_id and professional.id = professional_id;
  for v_link_id in
    update public.professional_procedures as link set
      status = 'inactive', archived_at = statement_timestamp(), version = link.version + 1
    where link.clinic_id = clinic_id and link.professional_id = professional_id
      and link.archived_at is null
    returning link.id
  loop
    perform app_private.log_audit_event(
      clinic_id, 'professional_procedure.archived', 'professional_procedure', v_link_id,
      jsonb_build_object('archived', false), jsonb_build_object('archived', true), null
    );
  end loop;
  perform app_private.log_audit_event(
    clinic_id, 'professional.archived', 'professional', professional_id,
    jsonb_build_object('version', v_professional.version, 'archived', false),
    jsonb_build_object('version', v_professional.version + 1, 'archived', true), null
  );
  return true;
end;
$$;

create function public.set_professional_specialties(
  clinic_id uuid,
  professional_id uuid,
  specialties jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
  v_current text[];
  v_item jsonb;
  v_name text;
  v_professional public.professionals;
  v_requested text[];
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'professional.manage')
  then raise exception using errcode = '42501', message = 'professional access denied'; end if;
  perform app_private.require_aal2();
  if specialties is null or jsonb_typeof(specialties) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid specialties';
  end if;
  if jsonb_array_length(specialties) > 20 then
    raise exception using errcode = '22023', message = 'invalid specialties';
  end if;

  select professional.* into v_professional
  from public.professionals as professional
  where professional.clinic_id = clinic_id and professional.id = professional_id
  for update;
  if not found then raise exception using errcode = 'P4301', message = 'professional not found'; end if;
  if v_professional.archived_at is not null then
    raise exception using errcode = 'P4302', message = 'professional archived';
  end if;

  for v_item in select value from jsonb_array_elements(specialties) loop
    if jsonb_typeof(v_item) <> 'string' then
      raise exception using errcode = '22023', message = 'invalid specialties';
    end if;
    v_name := trim(v_item #>> '{}');
    if char_length(v_name) not between 2 and 80 then
      raise exception using errcode = '22023', message = 'invalid specialties';
    end if;
  end loop;
  select coalesce(array_agg(lower(trim(item #>> '{}')) order by lower(trim(item #>> '{}'))), '{}')
    into v_requested from jsonb_array_elements(specialties) as input(item);
  if cardinality(v_requested) <> cardinality(array(select distinct unnest(v_requested))) then
    raise exception using errcode = '22023', message = 'invalid specialties';
  end if;
  select coalesce(array_agg(lower(trim(specialty.name)) order by lower(trim(specialty.name))), '{}')
    into v_current
  from public.professional_specialties as specialty
  where specialty.clinic_id = clinic_id and specialty.professional_id = professional_id;
  if v_current = v_requested then return true; end if;

  delete from public.professional_specialties as specialty
  where specialty.clinic_id = clinic_id and specialty.professional_id = professional_id;
  insert into public.professional_specialties (clinic_id, professional_id, name)
  select clinic_id, professional_id, trim(item #>> '{}')
  from jsonb_array_elements(specialties) as input(item);
  perform app_private.log_audit_event(
    clinic_id, 'professional.specialties_changed', 'professional', professional_id,
    jsonb_build_object('count', cardinality(v_current)),
    jsonb_build_object('count', cardinality(v_requested)), null
  );
  return true;
end;
$$;

create function public.link_professional_user(
  clinic_id uuid,
  professional_id uuid,
  linked_user_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
  v_professional public.professionals;
begin
  if v_actor_id is null or linked_user_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'professional.manage')
  then raise exception using errcode = '42501', message = 'professional access denied'; end if;
  perform app_private.require_aal2();
  perform 1 from public.clinic_members as member
  join public.clinics as clinic on clinic.id = member.clinic_id
  where member.clinic_id = clinic_id and member.user_id = linked_user_id
    and member.status = 'active' and clinic.status = 'active' and clinic.deleted_at is null
  for share of member;
  if not found then
    raise exception using errcode = 'P4304', message = 'professional user not member';
  end if;

  select professional.* into v_professional
  from public.professionals as professional
  where professional.clinic_id = clinic_id and professional.id = professional_id
  for update;
  if not found then raise exception using errcode = 'P4301', message = 'professional not found'; end if;
  if v_professional.archived_at is not null then
    raise exception using errcode = 'P4302', message = 'professional archived';
  end if;
  if v_professional.user_id = linked_user_id then return true; end if;
  begin
    update public.professionals as professional
    set user_id = linked_user_id, version = professional.version + 1, updated_by = v_actor_id
    where professional.clinic_id = clinic_id and professional.id = professional_id;
  exception when unique_violation then
    raise exception using errcode = 'P4303', message = 'professional user already linked';
  end;
  perform app_private.log_audit_event(
    clinic_id, 'professional.user_linked', 'professional', professional_id,
    jsonb_build_object('linked', v_professional.user_id is not null),
    jsonb_build_object('linked', true), null
  );
  return true;
end;
$$;

create function public.unlink_professional_user(clinic_id uuid, professional_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
  v_professional public.professionals;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'professional.manage')
  then raise exception using errcode = '42501', message = 'professional access denied'; end if;
  perform app_private.require_aal2();
  select professional.* into v_professional
  from public.professionals as professional
  where professional.clinic_id = clinic_id and professional.id = professional_id
  for update;
  if not found then raise exception using errcode = 'P4301', message = 'professional not found'; end if;
  if v_professional.archived_at is not null then
    raise exception using errcode = 'P4302', message = 'professional archived';
  end if;
  if v_professional.user_id is null then return true; end if;
  update public.professionals as professional
  set user_id = null, version = professional.version + 1, updated_by = v_actor_id
  where professional.clinic_id = clinic_id and professional.id = professional_id;
  perform app_private.log_audit_event(
    clinic_id, 'professional.user_unlinked', 'professional', professional_id,
    jsonb_build_object('linked', true), jsonb_build_object('linked', false), null
  );
  return true;
end;
$$;

create function public.set_professional_weekly_availability(
  clinic_id uuid,
  professional_id uuid,
  availability jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
  v_current jsonb;
  v_item jsonb;
  v_normalized jsonb;
  v_professional public.professionals;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'professional.manage')
  then raise exception using errcode = '42501', message = 'professional access denied'; end if;
  perform app_private.require_aal2();
  if availability is null or jsonb_typeof(availability) <> 'array' then
    raise exception using errcode = 'P4310', message = 'invalid availability';
  end if;
  if jsonb_array_length(availability) > 100 then
    raise exception using errcode = 'P4310', message = 'invalid availability';
  end if;

  select professional.* into v_professional
  from public.professionals as professional
  where professional.clinic_id = clinic_id and professional.id = professional_id
  for update;
  if not found then raise exception using errcode = 'P4301', message = 'professional not found'; end if;
  if v_professional.archived_at is not null then
    raise exception using errcode = 'P4302', message = 'professional archived';
  end if;

  begin
    for v_item in select value from jsonb_array_elements(availability) loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception using errcode = 'P4310', message = 'invalid availability';
      end if;
      if exists (select 1 from jsonb_object_keys(v_item) as key
          where key not in ('weekday', 'start_minute', 'end_minute'))
        or not (v_item ?& array['weekday', 'start_minute', 'end_minute'])
        or (v_item ->> 'weekday') !~ '^[0-9]+$'
        or (v_item ->> 'start_minute') !~ '^[0-9]+$'
        or (v_item ->> 'end_minute') !~ '^[0-9]+$'
      then raise exception using errcode = 'P4310', message = 'invalid availability'; end if;
      if (v_item ->> 'weekday')::integer not between 1 and 7
        or (v_item ->> 'start_minute')::integer not between 0 and 1439
        or (v_item ->> 'end_minute')::integer not between 1 and 1440
        or (v_item ->> 'start_minute')::integer >= (v_item ->> 'end_minute')::integer
      then raise exception using errcode = 'P4310', message = 'invalid availability'; end if;
    end loop;
  exception when numeric_value_out_of_range then
    raise exception using errcode = 'P4310', message = 'invalid availability';
  end;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'weekday', (item ->> 'weekday')::integer,
      'start_minute', (item ->> 'start_minute')::integer,
      'end_minute', (item ->> 'end_minute')::integer
    ) order by (item ->> 'weekday')::integer, (item ->> 'start_minute')::integer,
      (item ->> 'end_minute')::integer), '[]'::jsonb)
    into v_normalized from jsonb_array_elements(availability) as input(item);

    select coalesce(jsonb_agg(jsonb_build_object(
      'weekday', current.weekday, 'start_minute', current.start_minute,
      'end_minute', current.end_minute
    ) order by current.weekday, current.start_minute, current.end_minute), '[]'::jsonb)
    into v_current from public.professional_weekly_availability as current
    where current.clinic_id = clinic_id and current.professional_id = professional_id;
    if v_current = v_normalized then return true; end if;

    delete from public.professional_weekly_availability as current
    where current.clinic_id = clinic_id and current.professional_id = professional_id;
    insert into public.professional_weekly_availability (
      clinic_id, professional_id, weekday, start_minute, end_minute
    )
    select clinic_id, professional_id,
      (item ->> 'weekday')::smallint,
      (item ->> 'start_minute')::smallint,
      (item ->> 'end_minute')::smallint
    from jsonb_array_elements(v_normalized) as input(item);
  exception
    when sqlstate 'P4309' then
      raise exception using errcode = 'P4309', message = 'availability overlap';
    when unique_violation or check_violation then
      raise exception using errcode = 'P4310', message = 'invalid availability';
  end;

  perform app_private.log_audit_event(
    clinic_id, 'professional.availability_changed', 'professional', professional_id,
    jsonb_build_object('interval_count', jsonb_array_length(v_current)),
    jsonb_build_object('interval_count', jsonb_array_length(v_normalized)), null
  );
  return true;
end;
$$;

alter function public.create_professional(uuid, text, text, text, text, text, text, text, uuid)
owner to postgres;
alter function public.update_professional(uuid, uuid, text, text, text, text, text, text, text, text, integer)
owner to postgres;
alter function public.archive_professional(uuid, uuid) owner to postgres;
alter function public.set_professional_specialties(uuid, uuid, jsonb) owner to postgres;
alter function public.link_professional_user(uuid, uuid, uuid) owner to postgres;
alter function public.unlink_professional_user(uuid, uuid) owner to postgres;
alter function public.set_professional_weekly_availability(uuid, uuid, jsonb) owner to postgres;

revoke all on function public.create_professional(uuid, text, text, text, text, text, text, text, uuid)
from public, anon;
revoke all on function public.update_professional(uuid, uuid, text, text, text, text, text, text, text, text, integer)
from public, anon;
revoke all on function public.archive_professional(uuid, uuid) from public, anon;
revoke all on function public.set_professional_specialties(uuid, uuid, jsonb) from public, anon;
revoke all on function public.link_professional_user(uuid, uuid, uuid) from public, anon;
revoke all on function public.unlink_professional_user(uuid, uuid) from public, anon;
revoke all on function public.set_professional_weekly_availability(uuid, uuid, jsonb)
from public, anon;

grant execute on function public.create_professional(uuid, text, text, text, text, text, text, text, uuid)
to authenticated;
grant execute on function public.update_professional(uuid, uuid, text, text, text, text, text, text, text, text, integer)
to authenticated;
grant execute on function public.archive_professional(uuid, uuid) to authenticated;
grant execute on function public.set_professional_specialties(uuid, uuid, jsonb) to authenticated;
grant execute on function public.link_professional_user(uuid, uuid, uuid) to authenticated;
grant execute on function public.unlink_professional_user(uuid, uuid) to authenticated;
grant execute on function public.set_professional_weekly_availability(uuid, uuid, jsonb)
to authenticated;
