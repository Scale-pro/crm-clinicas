-- F2.2.6 — gerenciamento seguro e idempotente de múltiplas pipelines.

alter table public.pipelines
  add column creation_idempotency_key uuid,
  add column duplication_idempotency_key uuid,
  add column duplicated_from_pipeline_id uuid,
  add constraint pipelines_single_idempotency_kind_check check (
    creation_idempotency_key is null or duplication_idempotency_key is null
  ),
  add constraint pipelines_duplicated_from_fkey
    foreign key (clinic_id, duplicated_from_pipeline_id)
    references public.pipelines (clinic_id, id)
    deferrable initially deferred;

create unique index pipelines_clinic_creation_idempotency_idx
  on public.pipelines (clinic_id, creation_idempotency_key)
  where creation_idempotency_key is not null;

create unique index pipelines_clinic_duplication_idempotency_idx
  on public.pipelines (clinic_id, duplication_idempotency_key)
  where duplication_idempotency_key is not null;

create function public.create_pipeline(
  clinic_id uuid,
  name text,
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
  v_pipeline_id uuid;
  v_is_default boolean;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'pipeline.manage')
  then
    raise exception using errcode = '42501', message = 'pipeline access denied';
  end if;
  perform app_private.require_aal2();
  if name is null
    or char_length(trim(name)) not between 2 and 80
    or idempotency_key is null
  then
    raise exception using errcode = '22023', message = 'invalid pipeline';
  end if;

  perform c.id
  from public.clinics as c
  where c.id = clinic_id and c.status = 'active' and c.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'pipeline access denied';
  end if;

  select p.id into v_pipeline_id
  from public.pipelines as p
  where p.clinic_id = clinic_id
    and p.creation_idempotency_key = idempotency_key;
  if found then
    return v_pipeline_id;
  end if;

  select not exists (
    select 1
    from public.pipelines as active_default
    where active_default.clinic_id = clinic_id
      and active_default.is_default
      and active_default.archived_at is null
  ) into v_is_default;

  insert into public.pipelines (
    clinic_id,
    name,
    is_default,
    creation_idempotency_key
  ) values (
    clinic_id,
    trim(name),
    v_is_default,
    idempotency_key
  )
  returning id into v_pipeline_id;

  insert into public.pipeline_stages (
    clinic_id,
    pipeline_id,
    name,
    stage_kind,
    position
  ) values
    (clinic_id, v_pipeline_id, 'Novo lead', 'open', 100),
    (clinic_id, v_pipeline_id, 'Contato feito', 'open', 200),
    (clinic_id, v_pipeline_id, 'Reunião agendada', 'open', 300),
    (clinic_id, v_pipeline_id, 'Ganho', 'won', 900),
    (clinic_id, v_pipeline_id, 'Perdido', 'lost', 1000);

  perform app_private.log_audit_event(
    clinic_id,
    'pipeline.created',
    'pipeline',
    v_pipeline_id,
    null,
    jsonb_build_object(
      'pipeline_id', v_pipeline_id,
      'name', trim(name),
      'is_default', v_is_default,
      'archived', false,
      'stage_count', 5
    ),
    null
  );
  return v_pipeline_id;
exception when unique_violation then
  select p.id into v_pipeline_id
  from public.pipelines as p
  where p.clinic_id = clinic_id
    and p.creation_idempotency_key = idempotency_key;
  if found then
    return v_pipeline_id;
  end if;
  raise;
end;
$$;

create function public.duplicate_pipeline(
  clinic_id uuid,
  source_pipeline_id uuid,
  name text,
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
  v_pipeline_id uuid;
  v_source_archived_at timestamptz;
  v_stage_count integer;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'pipeline.manage')
  then
    raise exception using errcode = '42501', message = 'pipeline access denied';
  end if;
  perform app_private.require_aal2();
  if source_pipeline_id is null
    or name is null
    or char_length(trim(name)) not between 2 and 80
    or idempotency_key is null
  then
    raise exception using errcode = '22023', message = 'invalid pipeline';
  end if;

  perform c.id
  from public.clinics as c
  where c.id = clinic_id and c.status = 'active' and c.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'pipeline access denied';
  end if;

  select p.id into v_pipeline_id
  from public.pipelines as p
  where p.clinic_id = clinic_id
    and p.duplication_idempotency_key = idempotency_key;
  if found then
    return v_pipeline_id;
  end if;

  select p.archived_at into v_source_archived_at
  from public.pipelines as p
  where p.clinic_id = clinic_id and p.id = source_pipeline_id
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'pipeline not found';
  end if;
  if v_source_archived_at is not null then
    raise exception using errcode = 'P4201', message = 'pipeline archived';
  end if;

  perform ps.id
  from public.pipeline_stages as ps
  where ps.clinic_id = clinic_id and ps.pipeline_id = source_pipeline_id
  order by ps.position, ps.id
  for share;

  select count(*)::integer into v_stage_count
  from public.pipeline_stages as ps
  where ps.clinic_id = clinic_id and ps.pipeline_id = source_pipeline_id;
  if v_stage_count < 3
    or not exists (
      select 1 from public.pipeline_stages as ps
      where ps.pipeline_id = source_pipeline_id and ps.stage_kind = 'open'
    )
    or (select count(*) from public.pipeline_stages as ps
        where ps.pipeline_id = source_pipeline_id and ps.stage_kind = 'won') <> 1
    or (select count(*) from public.pipeline_stages as ps
        where ps.pipeline_id = source_pipeline_id and ps.stage_kind = 'lost') <> 1
  then
    raise exception using errcode = 'P4091', message = 'pipeline structure conflict';
  end if;

  insert into public.pipelines (
    clinic_id,
    name,
    is_default,
    duplication_idempotency_key,
    duplicated_from_pipeline_id
  ) values (
    clinic_id,
    trim(name),
    false,
    idempotency_key,
    source_pipeline_id
  )
  returning id into v_pipeline_id;

  insert into public.pipeline_stages (
    clinic_id,
    pipeline_id,
    name,
    stage_kind,
    position
  )
  select
    clinic_id,
    v_pipeline_id,
    ps.name,
    ps.stage_kind,
    ps.position
  from public.pipeline_stages as ps
  where ps.clinic_id = clinic_id and ps.pipeline_id = source_pipeline_id
  order by ps.position, ps.id;

  perform app_private.log_audit_event(
    clinic_id,
    'pipeline.duplicated',
    'pipeline',
    v_pipeline_id,
    jsonb_build_object('source_pipeline_id', source_pipeline_id),
    jsonb_build_object(
      'pipeline_id', v_pipeline_id,
      'source_pipeline_id', source_pipeline_id,
      'name', trim(name),
      'is_default', false,
      'archived', false,
      'stage_count', v_stage_count
    ),
    null
  );
  return v_pipeline_id;
exception when unique_violation then
  select p.id into v_pipeline_id
  from public.pipelines as p
  where p.clinic_id = clinic_id
    and p.duplication_idempotency_key = idempotency_key;
  if found then
    return v_pipeline_id;
  end if;
  raise;
end;
$$;

create function public.rename_pipeline(
  clinic_id uuid,
  pipeline_id uuid,
  name text
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
  v_previous_name text;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'pipeline.manage')
  then
    raise exception using errcode = '42501', message = 'pipeline access denied';
  end if;
  perform app_private.require_aal2();
  if pipeline_id is null
    or name is null
    or char_length(trim(name)) not between 2 and 80
  then
    raise exception using errcode = '22023', message = 'invalid pipeline';
  end if;

  select p.name into v_previous_name
  from public.pipelines as p
  where p.clinic_id = clinic_id and p.id = pipeline_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pipeline not found';
  end if;

  update public.pipelines as p
  set name = trim(name)
  where p.clinic_id = clinic_id and p.id = pipeline_id;

  perform app_private.log_audit_event(
    clinic_id,
    'pipeline.renamed',
    'pipeline',
    pipeline_id,
    jsonb_build_object('pipeline_id', pipeline_id, 'name', v_previous_name),
    jsonb_build_object('pipeline_id', pipeline_id, 'name', trim(name)),
    null
  );
  return true;
end;
$$;

create function public.set_default_pipeline(
  clinic_id uuid,
  pipeline_id uuid
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
  v_previous_pipeline_id uuid;
  v_archived_at timestamptz;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'pipeline.manage')
  then
    raise exception using errcode = '42501', message = 'pipeline access denied';
  end if;
  perform app_private.require_aal2();
  if pipeline_id is null then
    raise exception using errcode = '22023', message = 'invalid pipeline';
  end if;

  perform c.id
  from public.clinics as c
  where c.id = clinic_id and c.status = 'active' and c.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'pipeline access denied';
  end if;

  select p.archived_at into v_archived_at
  from public.pipelines as p
  where p.clinic_id = clinic_id and p.id = pipeline_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pipeline not found';
  end if;
  if v_archived_at is not null then
    raise exception using errcode = 'P4201', message = 'pipeline archived';
  end if;

  select p.id into v_previous_pipeline_id
  from public.pipelines as p
  where p.clinic_id = clinic_id
    and p.is_default
    and p.archived_at is null
  for update;

  if v_previous_pipeline_id is distinct from pipeline_id then
    update public.pipelines as p
    set is_default = false
    where p.clinic_id = clinic_id
      and p.is_default
      and p.archived_at is null;

    update public.pipelines as p
    set is_default = true
    where p.clinic_id = clinic_id
      and p.id = pipeline_id
      and p.archived_at is null;
    if not found then
      raise exception using errcode = 'P4091', message = 'pipeline default conflict';
    end if;
  end if;

  perform app_private.log_audit_event(
    clinic_id,
    'pipeline.default_changed',
    'pipeline',
    pipeline_id,
    jsonb_build_object('pipeline_id', v_previous_pipeline_id, 'is_default', true),
    jsonb_build_object('pipeline_id', pipeline_id, 'is_default', true),
    null
  );
  return true;
end;
$$;

create function public.archive_pipeline(
  clinic_id uuid,
  pipeline_id uuid
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
  v_pipeline public.pipelines;
  v_active_count integer;
  v_archived_at timestamptz := statement_timestamp();
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'pipeline.manage')
  then
    raise exception using errcode = '42501', message = 'pipeline access denied';
  end if;
  perform app_private.require_aal2();
  if pipeline_id is null then
    raise exception using errcode = '22023', message = 'invalid pipeline';
  end if;

  perform c.id
  from public.clinics as c
  where c.id = clinic_id and c.status = 'active' and c.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'pipeline access denied';
  end if;

  perform p.id
  from public.pipelines as p
  where p.clinic_id = clinic_id and p.archived_at is null
  order by p.id
  for update;

  select p.* into v_pipeline
  from public.pipelines as p
  where p.clinic_id = clinic_id and p.id = pipeline_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pipeline not found';
  end if;
  if v_pipeline.archived_at is not null then
    raise exception using errcode = 'P4201', message = 'pipeline archived';
  end if;
  if v_pipeline.is_default then
    raise exception using errcode = 'P4202', message = 'default pipeline cannot be archived';
  end if;

  select count(*)::integer into v_active_count
  from public.pipelines as p
  where p.clinic_id = clinic_id and p.archived_at is null;
  if v_active_count <= 1 then
    raise exception using errcode = 'P4203', message = 'last active pipeline cannot be archived';
  end if;

  if exists (
    select 1
    from public.opportunities as o
    where o.clinic_id = clinic_id
      and o.pipeline_id = pipeline_id
      and o.status = 'open'
  ) then
    raise exception using errcode = 'P4204', message = 'pipeline has open opportunities';
  end if;

  update public.pipelines as p
  set archived_at = v_archived_at
  where p.clinic_id = clinic_id
    and p.id = pipeline_id
    and p.archived_at is null;
  if not found then
    raise exception using errcode = 'P4091', message = 'pipeline archive conflict';
  end if;

  perform app_private.log_audit_event(
    clinic_id,
    'pipeline.archived',
    'pipeline',
    pipeline_id,
    jsonb_build_object(
      'pipeline_id', pipeline_id,
      'name', v_pipeline.name,
      'is_default', false,
      'archived_at', null
    ),
    jsonb_build_object(
      'pipeline_id', pipeline_id,
      'name', v_pipeline.name,
      'is_default', false,
      'archived_at', v_archived_at
    ),
    null
  );
  return true;
end;
$$;

alter function public.create_pipeline(uuid, text, uuid) owner to postgres;
alter function public.duplicate_pipeline(uuid, uuid, text, uuid) owner to postgres;
alter function public.rename_pipeline(uuid, uuid, text) owner to postgres;
alter function public.set_default_pipeline(uuid, uuid) owner to postgres;
alter function public.archive_pipeline(uuid, uuid) owner to postgres;

revoke all on function public.create_pipeline(uuid, text, uuid)
from public, anon, authenticated;
revoke all on function public.duplicate_pipeline(uuid, uuid, text, uuid)
from public, anon, authenticated;
revoke all on function public.rename_pipeline(uuid, uuid, text)
from public, anon, authenticated;
revoke all on function public.set_default_pipeline(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.archive_pipeline(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.create_pipeline(uuid, text, uuid)
to authenticated;
grant execute on function public.duplicate_pipeline(uuid, uuid, text, uuid)
to authenticated;
grant execute on function public.rename_pipeline(uuid, uuid, text)
to authenticated;
grant execute on function public.set_default_pipeline(uuid, uuid)
to authenticated;
grant execute on function public.archive_pipeline(uuid, uuid)
to authenticated;
