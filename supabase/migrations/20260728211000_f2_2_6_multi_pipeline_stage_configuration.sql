-- F2.2.6 — configuração das etapas em qualquer pipeline ativa da clínica.

drop function public.create_pipeline_stage(uuid, text);

create function public.create_pipeline_stage(
  clinic_id uuid,
  name text,
  pipeline_id uuid default null
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
  v_requested_pipeline_id uuid := pipeline_id;
  v_pipeline_id uuid;
  v_archived_at timestamptz;
  v_position integer;
  v_stage_id uuid;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'pipeline.manage')
  then
    raise exception using errcode = '42501', message = 'pipeline access denied';
  end if;
  perform app_private.require_aal2();
  if name is null or char_length(trim(name)) not between 1 and 60 then
    raise exception using errcode = '22023', message = 'invalid pipeline stage';
  end if;

  if v_requested_pipeline_id is null then
    select p.id, p.archived_at into v_pipeline_id, v_archived_at
    from public.pipelines as p
    where p.clinic_id = clinic_id and p.is_default and p.archived_at is null
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'default pipeline not found';
    end if;
  else
    select p.id, p.archived_at into v_pipeline_id, v_archived_at
    from public.pipelines as p
    where p.clinic_id = clinic_id and p.id = v_requested_pipeline_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'pipeline not found';
    end if;
    if v_archived_at is not null then
      raise exception using errcode = 'P4201', message = 'pipeline archived';
    end if;
  end if;

  perform ps.id
  from public.pipeline_stages as ps
  where ps.pipeline_id = v_pipeline_id
  order by ps.position, ps.id
  for update;

  select coalesce(max(ps.position), 0) + 100 into v_position
  from public.pipeline_stages as ps
  where ps.pipeline_id = v_pipeline_id;

  insert into public.pipeline_stages (
    clinic_id,
    pipeline_id,
    name,
    stage_kind,
    position
  ) values (
    clinic_id,
    v_pipeline_id,
    trim(name),
    'open',
    v_position
  ) returning id into v_stage_id;

  perform app_private.log_audit_event(
    clinic_id,
    'pipeline_stage.created',
    'pipeline_stage',
    v_stage_id,
    null,
    jsonb_build_object(
      'pipeline_id', v_pipeline_id,
      'stage_kind', 'open',
      'position', v_position
    ),
    null
  );
  return v_stage_id;
end;
$$;

create or replace function public.update_pipeline_stage(
  clinic_id uuid,
  pipeline_stage_id uuid,
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
  v_pipeline_id uuid;
  v_previous_name text;
  v_stage_kind text;
  v_archived_at timestamptz;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'pipeline.manage')
  then
    raise exception using errcode = '42501', message = 'pipeline access denied';
  end if;
  perform app_private.require_aal2();
  if name is null or char_length(trim(name)) not between 1 and 60 then
    raise exception using errcode = '22023', message = 'invalid pipeline stage';
  end if;

  select ps.pipeline_id, ps.name, ps.stage_kind, p.archived_at
    into v_pipeline_id, v_previous_name, v_stage_kind, v_archived_at
  from public.pipeline_stages as ps
  join public.pipelines as p
    on p.clinic_id = ps.clinic_id and p.id = ps.pipeline_id
  where ps.clinic_id = clinic_id and ps.id = pipeline_stage_id
  for update of p, ps;
  if not found then
    raise exception using errcode = 'P0002', message = 'pipeline stage not found';
  end if;
  if v_archived_at is not null then
    raise exception using errcode = 'P4201', message = 'pipeline archived';
  end if;

  update public.pipeline_stages as ps
  set name = trim(name)
  where ps.clinic_id = clinic_id and ps.id = pipeline_stage_id;

  perform app_private.log_audit_event(
    clinic_id,
    'pipeline_stage.updated',
    'pipeline_stage',
    pipeline_stage_id,
    jsonb_build_object(
      'pipeline_id', v_pipeline_id,
      'name', v_previous_name,
      'stage_kind', v_stage_kind
    ),
    jsonb_build_object(
      'pipeline_id', v_pipeline_id,
      'name', trim(name),
      'stage_kind', v_stage_kind
    ),
    null
  );
  return true;
end;
$$;

create or replace function public.reorder_pipeline_stages(
  clinic_id uuid,
  stage_ids uuid[]
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
  v_pipeline_id uuid;
  v_archived_at timestamptz;
  v_expected_count integer;
  v_stage_id uuid;
  v_ordinal integer := 0;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'pipeline.manage')
  then
    raise exception using errcode = '42501', message = 'pipeline access denied';
  end if;
  perform app_private.require_aal2();
  if stage_ids is null or cardinality(stage_ids) = 0 then
    raise exception using errcode = '22023', message = 'invalid pipeline stage order';
  end if;

  select ps.pipeline_id into v_pipeline_id
  from unnest(stage_ids) with ordinality as requested(id, ordinal)
  join public.pipeline_stages as ps
    on ps.clinic_id = clinic_id and ps.id = requested.id
  where requested.ordinal = 1;
  if not found then
    raise exception using errcode = 'P0002', message = 'pipeline stage not found';
  end if;

  select p.archived_at into v_archived_at
  from public.pipelines as p
  where p.clinic_id = clinic_id and p.id = v_pipeline_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pipeline not found';
  end if;
  if v_archived_at is not null then
    raise exception using errcode = 'P4201', message = 'pipeline archived';
  end if;

  perform ps.id
  from public.pipeline_stages as ps
  where ps.pipeline_id = v_pipeline_id
  order by ps.position, ps.id
  for update;

  select count(*)::integer into v_expected_count
  from public.pipeline_stages as ps
  where ps.pipeline_id = v_pipeline_id;
  if cardinality(stage_ids) <> v_expected_count
    or (select count(distinct item) from unnest(stage_ids) as item) <> v_expected_count
    or exists (
      select 1
      from unnest(stage_ids) as requested(id)
      where not exists (
        select 1
        from public.pipeline_stages as ps
        where ps.clinic_id = clinic_id
          and ps.pipeline_id = v_pipeline_id
          and ps.id = requested.id
      )
    )
  then
    raise exception using errcode = '22023', message = 'invalid pipeline stage order';
  end if;

  set constraints pipeline_stages_pipeline_position_key deferred;
  foreach v_stage_id in array stage_ids loop
    v_ordinal := v_ordinal + 1;
    update public.pipeline_stages as ps
    set position = v_ordinal * 100
    where ps.pipeline_id = v_pipeline_id and ps.id = v_stage_id;
  end loop;

  perform app_private.log_audit_event(
    clinic_id,
    'pipeline_stage.reordered',
    'pipeline',
    v_pipeline_id,
    null,
    jsonb_build_object('stage_ids', to_jsonb(stage_ids)),
    null
  );
  return true;
end;
$$;

alter function public.create_pipeline_stage(uuid, text, uuid) owner to postgres;
alter function public.update_pipeline_stage(uuid, uuid, text) owner to postgres;
alter function public.reorder_pipeline_stages(uuid, uuid[]) owner to postgres;

revoke all on function public.create_pipeline_stage(uuid, text, uuid)
from public, anon, authenticated;
revoke all on function public.update_pipeline_stage(uuid, uuid, text)
from public, anon, authenticated;
revoke all on function public.reorder_pipeline_stages(uuid, uuid[])
from public, anon, authenticated;

grant execute on function public.create_pipeline_stage(uuid, text, uuid)
to authenticated;
grant execute on function public.update_pipeline_stage(uuid, uuid, text)
to authenticated;
grant execute on function public.reorder_pipeline_stages(uuid, uuid[])
to authenticated;
