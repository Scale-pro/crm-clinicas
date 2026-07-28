-- F2.1 — mutações de CRM exclusivamente por RPC SECURITY DEFINER.

create function app_private.normalize_contact_method(p_kind text, p_raw_value text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_digits text;
  v_normalized text;
begin
  if p_kind = 'email' then
    v_normalized := lower(trim(p_raw_value));
    if char_length(v_normalized) > 320
      or v_normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then
      raise exception using errcode = '22023', message = 'invalid contact method';
    end if;
    return v_normalized;
  end if;

  if p_kind <> 'phone'
    or p_raw_value is null
    or p_raw_value ~ '[^0-9[:space:]()+.\-]'
  then
    raise exception using errcode = '22023', message = 'invalid contact method';
  end if;
  v_digits := pg_catalog.regexp_replace(p_raw_value, '[^0-9]', '', 'g');
  if char_length(v_digits) in (10, 11) then
    v_normalized := '+55' || v_digits;
  elsif char_length(v_digits) in (12, 13) and v_digits like '55%' then
    v_normalized := '+' || v_digits;
  else
    raise exception using errcode = '22023', message = 'invalid contact method';
  end if;
  if v_normalized !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception using errcode = '22023', message = 'invalid contact method';
  end if;
  return v_normalized;
end;
$$;
alter function app_private.normalize_contact_method(text, text) owner to postgres;
revoke all on function app_private.normalize_contact_method(text, text)
from public, anon, authenticated;

create function app_private.assert_contact_editable(
  p_clinic_id uuid,
  p_contact_id uuid,
  p_actor_id uuid
)
returns public.contacts
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_contact public.contacts;
begin
  select c.* into v_contact
  from public.contacts as c
  where c.clinic_id = p_clinic_id and c.id = p_contact_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'contact not found';
  end if;
  if not (
    app_private.has_permission(p_clinic_id, 'contact.edit_all')
    or (
      v_contact.owner_user_id = p_actor_id
      and app_private.has_permission(p_clinic_id, 'contact.edit_own')
    )
  ) then
    raise exception using errcode = '42501', message = 'contact access denied';
  end if;
  return v_contact;
end;
$$;
alter function app_private.assert_contact_editable(uuid, uuid, uuid) owner to postgres;
revoke all on function app_private.assert_contact_editable(uuid, uuid, uuid)
from public, anon, authenticated;

create function public.create_contact(
  clinic_id uuid,
  full_name text,
  notes text default null,
  idempotency_key uuid default null,
  methods jsonb default '[]'::jsonb,
  link_as_patient boolean default false
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
  v_contact_id uuid;
  v_conflicting_contact_id uuid;
  v_existing_id uuid;
  v_item jsonb;
  v_kind text;
  v_raw text;
  v_normalized text;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'contact.create')
  then
    raise exception using errcode = '42501', message = 'contact access denied';
  end if;
  if full_name is null or char_length(trim(full_name)) not between 2 and 160
    or (notes is not null and char_length(notes) > 2000)
    or methods is null or jsonb_typeof(methods) <> 'array'
    or jsonb_array_length(methods) > 10
  then
    raise exception using errcode = '22023', message = 'invalid contact';
  end if;

  if idempotency_key is not null then
    select c.id into v_existing_id
    from public.contacts as c
    where c.clinic_id = clinic_id and c.idempotency_key = idempotency_key;
    if found then return v_existing_id; end if;
  end if;

  begin
    insert into public.contacts (
      clinic_id, full_name, owner_user_id, notes, idempotency_key,
      created_by, updated_by
    ) values (
      clinic_id, trim(full_name), v_actor_id, notes, idempotency_key,
      v_actor_id, v_actor_id
    ) returning id into v_contact_id;

    for v_item in select value from jsonb_array_elements(methods) loop
      if jsonb_typeof(v_item) <> 'object'
        or exists (
          select 1 from jsonb_object_keys(v_item) as key
          where key not in ('kind', 'raw_value', 'normalized_value', 'label', 'is_primary', 'is_whatsapp')
        )
      then
        raise exception using errcode = '22023', message = 'invalid contact method';
      end if;
      v_kind := v_item ->> 'kind';
      v_raw := v_item ->> 'raw_value';
      v_normalized := app_private.normalize_contact_method(v_kind, v_raw);
      if v_item ->> 'normalized_value' is distinct from v_normalized then
        raise exception using errcode = '22023', message = 'invalid contact method';
      end if;
      insert into public.person_contacts (
        clinic_id, contact_id, kind, raw_value, normalized_value, label,
        is_primary, is_whatsapp
      ) values (
        clinic_id, v_contact_id, v_kind, v_raw, v_normalized,
        nullif(trim(v_item ->> 'label'), ''),
        coalesce((v_item ->> 'is_primary')::boolean, false),
        coalesce((v_item ->> 'is_whatsapp')::boolean, false)
      );
    end loop;

    if link_as_patient then
      insert into public.patients (clinic_id, contact_id)
      values (clinic_id, v_contact_id);
    end if;
  exception when unique_violation then
    if idempotency_key is not null then
      select c.id into v_existing_id
      from public.contacts as c
      where c.clinic_id = clinic_id and c.idempotency_key = idempotency_key;
      if found then return v_existing_id; end if;
    end if;
    select pc.contact_id into v_conflicting_contact_id
    from public.person_contacts as pc
    join public.contacts as c
      on c.clinic_id = pc.clinic_id and c.id = pc.contact_id
    where pc.clinic_id = clinic_id
      and pc.kind = v_kind
      and pc.normalized_value = v_normalized
      and pc.archived_at is null
      and (
        app_private.has_permission(clinic_id, 'contact.view_all')
        or (
          c.owner_user_id = v_actor_id
          and app_private.has_permission(clinic_id, 'contact.view_own')
        )
      )
    limit 1;
    raise exception using
      errcode = '23505',
      message = 'contact method already exists',
      detail = case when v_conflicting_contact_id is null then null
        else jsonb_build_object('contact_id', v_conflicting_contact_id)::text end;
  end;

  perform app_private.log_activity(clinic_id, 'contact.created', '{}'::jsonb, v_contact_id);
  perform app_private.log_audit_event(
    clinic_id, 'contact.created', 'contact', v_contact_id,
    null, jsonb_build_object('owner_user_id', v_actor_id, 'patient', link_as_patient), null
  );
  return v_contact_id;
end;
$$;

create function public.update_contact(
  clinic_id uuid,
  contact_id uuid,
  full_name text,
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
  v_contact public.contacts;
  v_new_version integer;
begin
  if v_actor_id is null or not app_private.is_clinic_member(clinic_id) then
    raise exception using errcode = '42501', message = 'contact access denied';
  end if;
  v_contact := app_private.assert_contact_editable(clinic_id, contact_id, v_actor_id);
  if not (
    app_private.has_permission(clinic_id, 'contact.edit_all')
    or (v_contact.owner_user_id = v_actor_id and app_private.has_permission(clinic_id, 'contact.edit_own'))
  ) then
    raise exception using errcode = '42501', message = 'contact access denied';
  end if;
  if full_name is null or char_length(trim(full_name)) not between 2 and 160
    or (notes is not null and char_length(notes) > 2000)
    or expected_version is null or expected_version < 1
  then
    raise exception using errcode = '22023', message = 'invalid contact';
  end if;
  if v_contact.version <> expected_version then
    raise exception using errcode = 'P4091', message = 'contact version conflict';
  end if;
  update public.contacts as c
  set full_name = trim(full_name), notes = notes, version = c.version + 1, updated_by = v_actor_id
  where c.clinic_id = clinic_id and c.id = contact_id and c.version = expected_version
  returning c.version into v_new_version;
  if not found then
    raise exception using errcode = 'P4091', message = 'contact version conflict';
  end if;
  perform app_private.log_audit_event(
    clinic_id, 'contact.updated', 'contact', contact_id,
    jsonb_build_object('version', v_contact.version),
    jsonb_build_object('version', v_new_version), null
  );
  return v_new_version;
end;
$$;

create function public.archive_contact(clinic_id uuid, contact_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
  v_contact public.contacts;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'contact.archive')
  then
    raise exception using errcode = '42501', message = 'contact access denied';
  end if;
  select c.* into v_contact from public.contacts as c
  where c.clinic_id = clinic_id and c.id = contact_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'contact not found'; end if;
  if v_contact.archived_at is not null then return true; end if;
  update public.contacts as c
  set archived_at = statement_timestamp(), version = c.version + 1, updated_by = v_actor_id
  where c.clinic_id = clinic_id and c.id = contact_id;
  perform app_private.log_activity(clinic_id, 'contact.archived', '{}'::jsonb, contact_id);
  perform app_private.log_audit_event(
    clinic_id, 'contact.archived', 'contact', contact_id,
    jsonb_build_object('archived', false), jsonb_build_object('archived', true), null
  );
  return true;
end;
$$;

create function public.assign_contact_owner(
  clinic_id uuid,
  contact_id uuid,
  owner_user_id uuid
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
  v_contact public.contacts;
begin
  if v_actor_id is null
    or owner_user_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'contact.edit_all')
  then
    raise exception using errcode = '42501', message = 'contact access denied';
  end if;
  if not exists (
    select 1 from public.clinic_members as cm
    where cm.clinic_id = clinic_id and cm.user_id = owner_user_id and cm.status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'invalid contact owner';
  end if;
  select c.* into v_contact from public.contacts as c
  where c.clinic_id = clinic_id and c.id = contact_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'contact not found'; end if;
  if v_contact.owner_user_id is not distinct from owner_user_id then return true; end if;
  update public.contacts as c
  set owner_user_id = owner_user_id, version = c.version + 1, updated_by = v_actor_id
  where c.clinic_id = clinic_id and c.id = contact_id;
  perform app_private.log_activity(
    clinic_id, 'contact.owner_changed',
    jsonb_build_object('previous_owner_user_id', v_contact.owner_user_id, 'owner_user_id', owner_user_id),
    contact_id
  );
  perform app_private.log_audit_event(
    clinic_id, 'contact.owner_changed', 'contact', contact_id,
    jsonb_build_object('owner_user_id', v_contact.owner_user_id),
    jsonb_build_object('owner_user_id', owner_user_id), null
  );
  return true;
end;
$$;

create function public.add_contact_method(
  clinic_id uuid,
  contact_id uuid,
  kind text,
  raw_value text,
  normalized_value text,
  label text default null,
  is_primary boolean default false,
  is_whatsapp boolean default false
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
  v_contact public.contacts;
  v_conflicting_contact_id uuid;
  v_id uuid;
begin
  if v_actor_id is null or not app_private.is_clinic_member(clinic_id) then
    raise exception using errcode = '42501', message = 'contact access denied';
  end if;
  v_contact := app_private.assert_contact_editable(clinic_id, contact_id, v_actor_id);
  if not (
    app_private.has_permission(clinic_id, 'contact.edit_all')
    or (v_contact.owner_user_id = v_actor_id and app_private.has_permission(clinic_id, 'contact.edit_own'))
  ) then raise exception using errcode = '42501', message = 'contact access denied'; end if;
  if normalized_value is distinct from app_private.normalize_contact_method(kind, raw_value)
    or (label is not null and char_length(trim(label)) not between 1 and 40)
    or (kind <> 'phone' and is_whatsapp)
  then raise exception using errcode = '22023', message = 'invalid contact method'; end if;
  if is_primary then
    perform 1 from public.person_contacts as pc
    where pc.clinic_id = clinic_id and pc.contact_id = contact_id and pc.kind = kind
    order by pc.id for update;
    update public.person_contacts as pc set is_primary = false
    where pc.clinic_id = clinic_id and pc.contact_id = contact_id
      and pc.kind = kind and pc.archived_at is null and pc.is_primary;
  end if;
  begin
    insert into public.person_contacts (
      clinic_id, contact_id, kind, raw_value, normalized_value, label, is_primary, is_whatsapp
    ) values (
      clinic_id, contact_id, kind, raw_value, normalized_value,
      nullif(trim(label), ''), is_primary, is_whatsapp
    ) returning id into v_id;
  exception when unique_violation then
    select pc.contact_id into v_conflicting_contact_id
    from public.person_contacts as pc
    join public.contacts as c
      on c.clinic_id = pc.clinic_id and c.id = pc.contact_id
    where pc.clinic_id = clinic_id
      and pc.kind = kind
      and pc.normalized_value = normalized_value
      and pc.archived_at is null
      and (
        app_private.has_permission(clinic_id, 'contact.view_all')
        or (
          c.owner_user_id = v_actor_id
          and app_private.has_permission(clinic_id, 'contact.view_own')
        )
      )
    limit 1;
    raise exception using
      errcode = '23505',
      message = 'contact method already exists',
      detail = case when v_conflicting_contact_id is null then null
        else jsonb_build_object('contact_id', v_conflicting_contact_id)::text end;
  end;
  perform app_private.log_audit_event(
    clinic_id, 'contact_method.created', 'person_contact', v_id,
    null, jsonb_build_object('contact_id', contact_id, 'method_kind', kind), null
  );
  return v_id;
end;
$$;

create function public.update_contact_method(
  clinic_id uuid,
  contact_method_id uuid,
  kind text,
  raw_value text,
  normalized_value text,
  label text default null,
  is_whatsapp boolean default false
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
  v_contact_id uuid;
  v_method public.person_contacts;
  v_contact public.contacts;
begin
  if v_actor_id is null or not app_private.is_clinic_member(clinic_id) then
    raise exception using errcode = '42501', message = 'contact access denied';
  end if;
  select pc.contact_id into v_contact_id from public.person_contacts as pc
  where pc.clinic_id = clinic_id and pc.id = contact_method_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'contact method not found';
  end if;
  v_contact := app_private.assert_contact_editable(clinic_id, v_contact_id, v_actor_id);
  select pc.* into v_method from public.person_contacts as pc
  where pc.clinic_id = clinic_id and pc.id = contact_method_id for update;
  if not found or v_method.archived_at is not null then
    raise exception using errcode = 'P0002', message = 'contact method not found';
  end if;
  if not (
    app_private.has_permission(clinic_id, 'contact.edit_all')
    or (v_contact.owner_user_id = v_actor_id and app_private.has_permission(clinic_id, 'contact.edit_own'))
  ) then raise exception using errcode = '42501', message = 'contact access denied'; end if;
  if kind <> v_method.kind
    or normalized_value is distinct from app_private.normalize_contact_method(kind, raw_value)
    or (label is not null and char_length(trim(label)) not between 1 and 40)
    or (kind <> 'phone' and is_whatsapp)
  then raise exception using errcode = '22023', message = 'invalid contact method'; end if;
  begin
    update public.person_contacts as pc
    set raw_value = raw_value, normalized_value = normalized_value,
        label = nullif(trim(label), ''), is_whatsapp = is_whatsapp
    where pc.clinic_id = clinic_id and pc.id = contact_method_id;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'contact method already exists';
  end;
  perform app_private.log_audit_event(
    clinic_id, 'contact_method.updated', 'person_contact', contact_method_id,
    jsonb_build_object('contact_id', v_method.contact_id, 'method_kind', v_method.kind),
    jsonb_build_object('contact_id', v_method.contact_id, 'method_kind', kind), null
  );
  return true;
end;
$$;

create function public.archive_contact_method(clinic_id uuid, contact_method_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
  v_contact_id uuid;
  v_method public.person_contacts;
  v_contact public.contacts;
begin
  if v_actor_id is null or not app_private.is_clinic_member(clinic_id) then
    raise exception using errcode = '42501', message = 'contact access denied';
  end if;
  select pc.contact_id into v_contact_id from public.person_contacts as pc
  where pc.clinic_id = clinic_id and pc.id = contact_method_id;
  if not found then raise exception using errcode = 'P0002', message = 'contact method not found'; end if;
  v_contact := app_private.assert_contact_editable(clinic_id, v_contact_id, v_actor_id);
  select pc.* into v_method from public.person_contacts as pc
  where pc.clinic_id = clinic_id and pc.id = contact_method_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'contact method not found'; end if;
  if not (
    app_private.has_permission(clinic_id, 'contact.edit_all')
    or (v_contact.owner_user_id = v_actor_id and app_private.has_permission(clinic_id, 'contact.edit_own'))
  ) then raise exception using errcode = '42501', message = 'contact access denied'; end if;
  if v_method.archived_at is not null then return true; end if;
  update public.person_contacts as pc
  set archived_at = statement_timestamp(), is_primary = false
  where pc.clinic_id = clinic_id and pc.id = contact_method_id;
  perform app_private.log_audit_event(
    clinic_id, 'contact_method.archived', 'person_contact', contact_method_id,
    jsonb_build_object('contact_id', v_method.contact_id, 'method_kind', v_method.kind, 'archived', false),
    jsonb_build_object('contact_id', v_method.contact_id, 'method_kind', v_method.kind, 'archived', true), null
  );
  return true;
end;
$$;

create function public.set_primary_contact_method(clinic_id uuid, contact_method_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
  v_contact_id uuid;
  v_method public.person_contacts;
  v_contact public.contacts;
begin
  if v_actor_id is null or not app_private.is_clinic_member(clinic_id) then
    raise exception using errcode = '42501', message = 'contact access denied';
  end if;
  select pc.contact_id into v_contact_id from public.person_contacts as pc
  where pc.clinic_id = clinic_id and pc.id = contact_method_id;
  if not found then raise exception using errcode = 'P0002', message = 'contact method not found'; end if;
  v_contact := app_private.assert_contact_editable(clinic_id, v_contact_id, v_actor_id);
  select pc.* into v_method from public.person_contacts as pc
  where pc.clinic_id = clinic_id and pc.id = contact_method_id and pc.archived_at is null
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'contact method not found'; end if;
  if not (
    app_private.has_permission(clinic_id, 'contact.edit_all')
    or (v_contact.owner_user_id = v_actor_id and app_private.has_permission(clinic_id, 'contact.edit_own'))
  ) then raise exception using errcode = '42501', message = 'contact access denied'; end if;
  perform 1 from public.person_contacts as pc
  where pc.clinic_id = clinic_id and pc.contact_id = v_method.contact_id
    and pc.kind = v_method.kind and pc.archived_at is null
  order by pc.id for update;
  update public.person_contacts as pc set is_primary = false
  where pc.clinic_id = clinic_id and pc.contact_id = v_method.contact_id
    and pc.kind = v_method.kind and pc.archived_at is null;
  update public.person_contacts as pc set is_primary = true
  where pc.clinic_id = clinic_id and pc.id = contact_method_id;
  perform app_private.log_audit_event(
    clinic_id, 'contact_method.primary_changed', 'person_contact', contact_method_id,
    null, jsonb_build_object('contact_id', v_method.contact_id, 'method_kind', v_method.kind), null
  );
  return true;
end;
$$;

create function public.link_contact_as_patient(clinic_id uuid, contact_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
  v_contact public.contacts;
begin
  if v_actor_id is null or not app_private.is_clinic_member(clinic_id) then
    raise exception using errcode = '42501', message = 'contact access denied';
  end if;
  v_contact := app_private.assert_contact_editable(clinic_id, contact_id, v_actor_id);
  if not (
    app_private.has_permission(clinic_id, 'contact.edit_all')
    or (v_contact.owner_user_id = v_actor_id and app_private.has_permission(clinic_id, 'contact.edit_own'))
  ) then raise exception using errcode = '42501', message = 'contact access denied'; end if;
  insert into public.patients (clinic_id, contact_id)
  values (clinic_id, contact_id) on conflict on constraint patients_pkey do nothing;
  if not found then return true; end if;
  perform app_private.log_activity(clinic_id, 'contact.patient_linked', '{}'::jsonb, contact_id);
  perform app_private.log_audit_event(
    clinic_id, 'contact.patient_linked', 'patient', contact_id,
    null, jsonb_build_object('contact_id', contact_id), null
  );
  return true;
end;
$$;

create function public.unlink_contact_as_patient(clinic_id uuid, contact_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
  v_contact public.contacts;
begin
  if v_actor_id is null or not app_private.is_clinic_member(clinic_id) then
    raise exception using errcode = '42501', message = 'contact access denied';
  end if;
  v_contact := app_private.assert_contact_editable(clinic_id, contact_id, v_actor_id);
  if not (
    app_private.has_permission(clinic_id, 'contact.edit_all')
    or (v_contact.owner_user_id = v_actor_id and app_private.has_permission(clinic_id, 'contact.edit_own'))
  ) then raise exception using errcode = '42501', message = 'contact access denied'; end if;
  delete from public.patients as p where p.clinic_id = clinic_id and p.contact_id = contact_id;
  if not found then return true; end if;
  perform app_private.log_activity(clinic_id, 'contact.patient_unlinked', '{}'::jsonb, contact_id);
  perform app_private.log_audit_event(
    clinic_id, 'contact.patient_unlinked', 'patient', contact_id,
    jsonb_build_object('contact_id', contact_id), null, null
  );
  return true;
end;
$$;

create function public.create_lead_source(clinic_id uuid, name text)
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
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'lead_source.manage')
  then raise exception using errcode = '42501', message = 'lead source access denied'; end if;
  if name is null or char_length(trim(name)) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'invalid lead source';
  end if;
  begin
    insert into public.lead_sources (clinic_id, name) values (clinic_id, trim(name))
    returning id into v_id;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'lead source already exists';
  end;
  perform app_private.log_audit_event(
    clinic_id, 'lead_source.created', 'lead_source', v_id, null,
    jsonb_build_object('active', true), null
  );
  return v_id;
end;
$$;

create function public.update_lead_source(clinic_id uuid, lead_source_id uuid, name text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'lead_source.manage')
  then raise exception using errcode = '42501', message = 'lead source access denied'; end if;
  if name is null or char_length(trim(name)) not between 2 and 80 then
    raise exception using errcode = '22023', message = 'invalid lead source';
  end if;
  begin
    update public.lead_sources as ls set name = trim(name)
    where ls.clinic_id = clinic_id and ls.id = lead_source_id and ls.archived_at is null;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'lead source already exists';
  end;
  if not found then raise exception using errcode = 'P0002', message = 'lead source not found'; end if;
  perform app_private.log_audit_event(
    clinic_id, 'lead_source.updated', 'lead_source', lead_source_id,
    null, jsonb_build_object('active', true), null
  );
  return true;
end;
$$;

create function public.archive_lead_source(clinic_id uuid, lead_source_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
  v_source public.lead_sources;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'lead_source.manage')
  then raise exception using errcode = '42501', message = 'lead source access denied'; end if;
  select ls.* into v_source from public.lead_sources as ls
  where ls.clinic_id = clinic_id and ls.id = lead_source_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'lead source not found'; end if;
  if v_source.archived_at is not null then return true; end if;
  update public.lead_sources as ls set archived_at = statement_timestamp()
  where ls.clinic_id = clinic_id and ls.id = lead_source_id;
  perform app_private.log_audit_event(
    clinic_id, 'lead_source.archived', 'lead_source', lead_source_id,
    jsonb_build_object('archived', false), jsonb_build_object('archived', true), null
  );
  return true;
end;
$$;

alter function public.create_contact(uuid, text, text, uuid, jsonb, boolean) owner to postgres;
alter function public.update_contact(uuid, uuid, text, text, integer) owner to postgres;
alter function public.archive_contact(uuid, uuid) owner to postgres;
alter function public.assign_contact_owner(uuid, uuid, uuid) owner to postgres;
alter function public.add_contact_method(uuid, uuid, text, text, text, text, boolean, boolean) owner to postgres;
alter function public.update_contact_method(uuid, uuid, text, text, text, text, boolean) owner to postgres;
alter function public.archive_contact_method(uuid, uuid) owner to postgres;
alter function public.set_primary_contact_method(uuid, uuid) owner to postgres;
alter function public.link_contact_as_patient(uuid, uuid) owner to postgres;
alter function public.unlink_contact_as_patient(uuid, uuid) owner to postgres;
alter function public.create_lead_source(uuid, text) owner to postgres;
alter function public.update_lead_source(uuid, uuid, text) owner to postgres;
alter function public.archive_lead_source(uuid, uuid) owner to postgres;

revoke all on function public.create_contact(uuid, text, text, uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.update_contact(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.archive_contact(uuid, uuid) from public, anon, authenticated;
revoke all on function public.assign_contact_owner(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.add_contact_method(uuid, uuid, text, text, text, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.update_contact_method(uuid, uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.archive_contact_method(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_primary_contact_method(uuid, uuid) from public, anon, authenticated;
revoke all on function public.link_contact_as_patient(uuid, uuid) from public, anon, authenticated;
revoke all on function public.unlink_contact_as_patient(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_lead_source(uuid, text) from public, anon, authenticated;
revoke all on function public.update_lead_source(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.archive_lead_source(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_contact(uuid, text, text, uuid, jsonb, boolean) to authenticated;
grant execute on function public.update_contact(uuid, uuid, text, text, integer) to authenticated;
grant execute on function public.archive_contact(uuid, uuid) to authenticated;
grant execute on function public.assign_contact_owner(uuid, uuid, uuid) to authenticated;
grant execute on function public.add_contact_method(uuid, uuid, text, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.update_contact_method(uuid, uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.archive_contact_method(uuid, uuid) to authenticated;
grant execute on function public.set_primary_contact_method(uuid, uuid) to authenticated;
grant execute on function public.link_contact_as_patient(uuid, uuid) to authenticated;
grant execute on function public.unlink_contact_as_patient(uuid, uuid) to authenticated;
grant execute on function public.create_lead_source(uuid, text) to authenticated;
grant execute on function public.update_lead_source(uuid, uuid, text) to authenticated;
grant execute on function public.archive_lead_source(uuid, uuid) to authenticated;
