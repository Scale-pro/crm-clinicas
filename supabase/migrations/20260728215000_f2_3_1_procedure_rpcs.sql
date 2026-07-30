-- F2.3.1 — catálogo de procedimentos e vínculos profissional-procedimento.

create function public.create_procedure(
  clinic_id uuid,
  name text,
  description text,
  category text,
  default_duration_minutes integer,
  base_price_cents bigint,
  color text,
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
  v_existing_id uuid;
  v_id uuid;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'procedure.manage')
  then raise exception using errcode = '42501', message = 'procedure access denied'; end if;
  perform app_private.require_aal2();
  if idempotency_key is null or name is null or char_length(trim(name)) not between 2 and 160
    or (description is not null and char_length(description) > 2000)
    or (category is not null and char_length(trim(category)) not between 1 and 100)
    or default_duration_minutes is null or default_duration_minutes not between 5 and 1440
    or base_price_cents is null or base_price_cents not between 0 and 9007199254740991
    or color is null or upper(trim(color)) !~ '^#[0-9A-F]{6}$'
  then raise exception using errcode = '22023', message = 'invalid procedure'; end if;

  select procedure.id into v_existing_id from public.procedures as procedure
  where procedure.clinic_id = clinic_id
    and procedure.creation_idempotency_key = idempotency_key;
  if found then return v_existing_id; end if;
  begin
    insert into public.procedures (
      clinic_id, name, description, category, default_duration_minutes,
      base_price_cents, color, creation_idempotency_key, created_by, updated_by
    ) values (
      clinic_id, trim(name), description, nullif(trim(category), ''),
      default_duration_minutes, base_price_cents, upper(trim(color)),
      idempotency_key, v_actor_id, v_actor_id
    ) returning id into v_id;
  exception when unique_violation then
    select procedure.id into v_existing_id from public.procedures as procedure
    where procedure.clinic_id = clinic_id
      and procedure.creation_idempotency_key = idempotency_key;
    if found then return v_existing_id; end if;
    raise exception using errcode = 'P4307', message = 'procedure name conflict';
  end;
  perform app_private.log_audit_event(
    clinic_id, 'procedure.created', 'procedure', v_id, null,
    jsonb_build_object(
      'version', 1, 'status', 'active',
      'default_duration_minutes', default_duration_minutes,
      'base_price_cents', base_price_cents
    ), null
  );
  return v_id;
end;
$$;

create function public.update_procedure(
  clinic_id uuid,
  procedure_id uuid,
  name text,
  description text,
  category text,
  default_duration_minutes integer,
  base_price_cents bigint,
  color text,
  status text,
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
  v_new_version integer;
  v_procedure public.procedures;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'procedure.manage')
  then raise exception using errcode = '42501', message = 'procedure access denied'; end if;
  perform app_private.require_aal2();
  select procedure.* into v_procedure from public.procedures as procedure
  where procedure.clinic_id = clinic_id and procedure.id = procedure_id
  for update;
  if not found then raise exception using errcode = 'P4305', message = 'procedure not found'; end if;
  if v_procedure.archived_at is not null then
    raise exception using errcode = 'P4306', message = 'procedure archived';
  end if;
  if expected_version is null or expected_version < 1
    or name is null or char_length(trim(name)) not between 2 and 160
    or (description is not null and char_length(description) > 2000)
    or (category is not null and char_length(trim(category)) not between 1 and 100)
    or default_duration_minutes is null or default_duration_minutes not between 5 and 1440
    or base_price_cents is null or base_price_cents not between 0 and 9007199254740991
    or color is null or upper(trim(color)) !~ '^#[0-9A-F]{6}$'
    or status not in ('active', 'inactive')
  then raise exception using errcode = '22023', message = 'invalid procedure'; end if;
  if v_procedure.version <> expected_version then
    raise exception using errcode = 'P4091', message = 'procedure version conflict';
  end if;
  begin
    update public.procedures as procedure set
      name = trim(name), description = description, category = nullif(trim(category), ''),
      default_duration_minutes = default_duration_minutes,
      base_price_cents = base_price_cents, color = upper(trim(color)), status = status,
      version = procedure.version + 1, updated_by = v_actor_id
    where procedure.clinic_id = clinic_id and procedure.id = procedure_id
      and procedure.version = expected_version
    returning procedure.version into v_new_version;
  exception when unique_violation then
    raise exception using errcode = 'P4307', message = 'procedure name conflict';
  end;
  if not found then raise exception using errcode = 'P4091', message = 'procedure version conflict'; end if;
  perform app_private.log_audit_event(
    clinic_id, 'procedure.updated', 'procedure', procedure_id,
    jsonb_build_object(
      'version', v_procedure.version, 'status', v_procedure.status,
      'default_duration_minutes', v_procedure.default_duration_minutes,
      'base_price_cents', v_procedure.base_price_cents
    ),
    jsonb_build_object(
      'version', v_new_version, 'status', status,
      'default_duration_minutes', default_duration_minutes,
      'base_price_cents', base_price_cents
    ), null
  );
  return v_new_version;
end;
$$;

create function public.archive_procedure(clinic_id uuid, procedure_id uuid)
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
  v_procedure public.procedures;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'procedure.manage')
  then raise exception using errcode = '42501', message = 'procedure access denied'; end if;
  perform app_private.require_aal2();
  select procedure.* into v_procedure from public.procedures as procedure
  where procedure.clinic_id = clinic_id and procedure.id = procedure_id
  for update;
  if not found then raise exception using errcode = 'P4305', message = 'procedure not found'; end if;
  if v_procedure.archived_at is not null then return true; end if;
  update public.procedures as procedure set
    status = 'inactive', archived_at = statement_timestamp(),
    version = procedure.version + 1, updated_by = v_actor_id
  where procedure.clinic_id = clinic_id and procedure.id = procedure_id;
  for v_link_id in
    update public.professional_procedures as link set
      status = 'inactive', archived_at = statement_timestamp(), version = link.version + 1
    where link.clinic_id = clinic_id and link.procedure_id = procedure_id
      and link.archived_at is null
    returning link.id
  loop
    perform app_private.log_audit_event(
      clinic_id, 'professional_procedure.archived', 'professional_procedure', v_link_id,
      jsonb_build_object('archived', false), jsonb_build_object('archived', true), null
    );
  end loop;
  perform app_private.log_audit_event(
    clinic_id, 'procedure.archived', 'procedure', procedure_id,
    jsonb_build_object('version', v_procedure.version, 'archived', false),
    jsonb_build_object('version', v_procedure.version + 1, 'archived', true), null
  );
  return true;
end;
$$;

create function public.set_professional_procedure(
  clinic_id uuid,
  professional_id uuid,
  procedure_id uuid,
  duration_minutes_override integer,
  price_cents_override bigint,
  expected_version integer
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
  v_id uuid;
  v_link public.professional_procedures;
  v_professional public.professionals;
  v_procedure public.procedures;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'professional.manage')
    or not app_private.has_permission(clinic_id, 'procedure.manage')
  then raise exception using errcode = '42501', message = 'professional procedure access denied'; end if;
  perform app_private.require_aal2();
  if (duration_minutes_override is not null and duration_minutes_override not between 5 and 1440)
    or (price_cents_override is not null
      and price_cents_override not between 0 and 9007199254740991)
  then raise exception using errcode = '22023', message = 'invalid professional procedure'; end if;

  select professional.* into v_professional from public.professionals as professional
  where professional.clinic_id = clinic_id and professional.id = professional_id
  for update;
  if not found then raise exception using errcode = 'P4301', message = 'professional not found'; end if;
  if v_professional.archived_at is not null or v_professional.status <> 'active' then
    raise exception using errcode = 'P4302', message = 'professional archived';
  end if;
  select procedure.* into v_procedure from public.procedures as procedure
  where procedure.clinic_id = clinic_id and procedure.id = procedure_id
  for update;
  if not found then raise exception using errcode = 'P4305', message = 'procedure not found'; end if;
  if v_procedure.archived_at is not null or v_procedure.status <> 'active' then
    raise exception using errcode = 'P4306', message = 'procedure archived';
  end if;

  select link.* into v_link from public.professional_procedures as link
  where link.clinic_id = clinic_id and link.professional_id = professional_id
    and link.procedure_id = procedure_id
  for update;
  if found then
    if v_link.status = 'active' and v_link.archived_at is null
      and v_link.duration_minutes_override is not distinct from duration_minutes_override
      and v_link.price_cents_override is not distinct from price_cents_override
    then return v_link.id; end if;
    if expected_version is null or v_link.version <> expected_version then
      raise exception using errcode = 'P4091', message = 'professional procedure version conflict';
    end if;
    update public.professional_procedures as link set
      duration_minutes_override = duration_minutes_override,
      price_cents_override = price_cents_override,
      status = 'active', archived_at = null, version = link.version + 1
    where link.id = v_link.id and link.version = expected_version
    returning link.id into v_id;
    if not found then
      raise exception using errcode = 'P4091', message = 'professional procedure version conflict';
    end if;
    perform app_private.log_audit_event(
      clinic_id, 'professional_procedure.updated', 'professional_procedure', v_id,
      jsonb_build_object(
        'version', v_link.version,
        'duration_override', v_link.duration_minutes_override is not null,
        'price_override', v_link.price_cents_override is not null,
        'active', v_link.status = 'active' and v_link.archived_at is null
      ),
      jsonb_build_object(
        'version', v_link.version + 1,
        'duration_override', duration_minutes_override is not null,
        'price_override', price_cents_override is not null,
        'active', true
      ), null
    );
    return v_id;
  end if;

  if expected_version is not null then
    raise exception using errcode = 'P4091', message = 'professional procedure version conflict';
  end if;

  begin
    insert into public.professional_procedures (
      clinic_id, professional_id, procedure_id,
      duration_minutes_override, price_cents_override
    ) values (
      clinic_id, professional_id, procedure_id,
      duration_minutes_override, price_cents_override
    ) returning id into v_id;
  exception when unique_violation then
    select link.* into v_link from public.professional_procedures as link
    where link.clinic_id = clinic_id and link.professional_id = professional_id
      and link.procedure_id = procedure_id;
    if found and v_link.status = 'active' and v_link.archived_at is null
      and v_link.duration_minutes_override is not distinct from duration_minutes_override
      and v_link.price_cents_override is not distinct from price_cents_override
    then return v_link.id; end if;
    raise exception using errcode = 'P4091', message = 'professional procedure version conflict';
  end;
  perform app_private.log_audit_event(
    clinic_id, 'professional_procedure.created', 'professional_procedure', v_id,
    null, jsonb_build_object(
      'version', 1,
      'duration_override', duration_minutes_override is not null,
      'price_override', price_cents_override is not null
    ), null
  );
  return v_id;
end;
$$;

create function public.archive_professional_procedure(
  clinic_id uuid,
  professional_procedure_id uuid
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
  v_link public.professional_procedures;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'professional.manage')
    or not app_private.has_permission(clinic_id, 'procedure.manage')
  then raise exception using errcode = '42501', message = 'professional procedure access denied'; end if;
  perform app_private.require_aal2();
  select link.* into v_link from public.professional_procedures as link
  where link.clinic_id = clinic_id and link.id = professional_procedure_id
  for update;
  if not found then
    raise exception using errcode = 'P4308', message = 'professional procedure conflict';
  end if;
  if v_link.archived_at is not null then return true; end if;
  update public.professional_procedures as link set
    status = 'inactive', archived_at = statement_timestamp(), version = link.version + 1
  where link.clinic_id = clinic_id and link.id = professional_procedure_id;
  perform app_private.log_audit_event(
    clinic_id, 'professional_procedure.archived', 'professional_procedure',
    professional_procedure_id,
    jsonb_build_object('version', v_link.version, 'archived', false),
    jsonb_build_object('version', v_link.version + 1, 'archived', true), null
  );
  return true;
end;
$$;

alter function public.create_procedure(uuid, text, text, text, integer, bigint, text, uuid)
owner to postgres;
alter function public.update_procedure(uuid, uuid, text, text, text, integer, bigint, text, text, integer)
owner to postgres;
alter function public.archive_procedure(uuid, uuid) owner to postgres;
alter function public.set_professional_procedure(uuid, uuid, uuid, integer, bigint, integer)
owner to postgres;
alter function public.archive_professional_procedure(uuid, uuid) owner to postgres;

revoke all on function public.create_procedure(uuid, text, text, text, integer, bigint, text, uuid)
from public, anon;
revoke all on function public.update_procedure(uuid, uuid, text, text, text, integer, bigint, text, text, integer)
from public, anon;
revoke all on function public.archive_procedure(uuid, uuid) from public, anon;
revoke all on function public.set_professional_procedure(uuid, uuid, uuid, integer, bigint, integer)
from public, anon;
revoke all on function public.archive_professional_procedure(uuid, uuid) from public, anon;

grant execute on function public.create_procedure(uuid, text, text, text, integer, bigint, text, uuid)
to authenticated;
grant execute on function public.update_procedure(uuid, uuid, text, text, text, integer, bigint, text, text, integer)
to authenticated;
grant execute on function public.archive_procedure(uuid, uuid) to authenticated;
grant execute on function public.set_professional_procedure(uuid, uuid, uuid, integer, bigint, integer)
to authenticated;
grant execute on function public.archive_professional_procedure(uuid, uuid) to authenticated;
