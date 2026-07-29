-- F2.2.6 — criação de oportunidade na pipeline escolhida, com fallback compatível.

drop function public.create_opportunity(
  uuid, uuid, text, bigint, uuid, uuid, boolean
);

create function public.create_opportunity(
  clinic_id uuid,
  contact_id uuid,
  title text,
  amount_cents bigint default null,
  initial_source_id uuid default null,
  idempotency_key uuid default null,
  confirmed_existing_open boolean default false,
  pipeline_id uuid default null
)
returns table (opportunity_id uuid, has_existing_open boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
  v_existing_id uuid;
  v_has_existing_open boolean;
  v_requested_pipeline_id uuid := pipeline_id;
  v_pipeline_id uuid;
  v_pipeline_archived_at timestamptz;
  v_stage_id uuid;
  v_board_position numeric;
  v_opportunity_id uuid;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'opportunity.create')
  then
    raise exception using errcode = '42501', message = 'opportunity access denied';
  end if;
  if title is null or char_length(trim(title)) not between 2 and 160
    or (amount_cents is not null and amount_cents < 0)
    or idempotency_key is null
  then
    raise exception using errcode = '22023', message = 'invalid opportunity';
  end if;

  select o.id into v_existing_id
  from public.opportunities as o
  where o.clinic_id = clinic_id and o.idempotency_key = idempotency_key;
  if found then
    return query select v_existing_id, false;
    return;
  end if;

  if not exists (
    select 1 from public.contacts as c
    where c.clinic_id = clinic_id and c.id = contact_id and c.archived_at is null
  ) then
    raise exception using errcode = 'P0002', message = 'contact not found';
  end if;
  if initial_source_id is not null and not exists (
    select 1 from public.lead_sources as ls
    where ls.clinic_id = clinic_id and ls.id = initial_source_id
      and ls.archived_at is null
  ) then
    raise exception using errcode = '22023', message = 'invalid lead source';
  end if;

  if v_requested_pipeline_id is null then
    select p.id, p.archived_at
      into v_pipeline_id, v_pipeline_archived_at
    from public.pipelines as p
    where p.clinic_id = clinic_id
      and p.is_default
      and p.archived_at is null
    for share;
    if not found then
      raise exception using errcode = 'P0002', message = 'default pipeline not found';
    end if;
  else
    select p.id, p.archived_at
      into v_pipeline_id, v_pipeline_archived_at
    from public.pipelines as p
    where p.clinic_id = clinic_id and p.id = v_requested_pipeline_id
    for share;
    if not found then
      raise exception using errcode = 'P0002', message = 'pipeline not found';
    end if;
    if v_pipeline_archived_at is not null then
      raise exception using errcode = 'P4201', message = 'pipeline archived';
    end if;
  end if;

  select ps.id into v_stage_id
  from public.pipeline_stages as ps
  where ps.clinic_id = clinic_id
    and ps.pipeline_id = v_pipeline_id
    and ps.stage_kind = 'open'
  order by ps.position, ps.id
  limit 1;
  if not found then
    raise exception using errcode = 'P4091', message = 'pipeline structure conflict';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      clinic_id::text || ':' || contact_id::text || ':' || v_pipeline_id::text,
      1
    )
  );
  select exists (
    select 1 from public.opportunities as open_opportunity
    where open_opportunity.clinic_id = clinic_id
      and open_opportunity.contact_id = contact_id
      and open_opportunity.pipeline_id = v_pipeline_id
      and open_opportunity.status = 'open'
  ) into v_has_existing_open;
  if v_has_existing_open and not confirmed_existing_open then
    return query select null::uuid, true;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_stage_id::text, 0)
  );
  select coalesce(max(o.board_position), 0) + 1000
    into v_board_position
  from public.opportunities as o
  where o.clinic_id = clinic_id and o.stage_id = v_stage_id and o.status = 'open';

  begin
    insert into public.opportunities (
      clinic_id,
      contact_id,
      pipeline_id,
      stage_id,
      status,
      assigned_to_user_id,
      initial_source_id,
      title,
      amount_cents,
      board_position,
      idempotency_key
    ) values (
      clinic_id,
      contact_id,
      v_pipeline_id,
      v_stage_id,
      'open',
      v_actor_id,
      initial_source_id,
      trim(title),
      amount_cents,
      v_board_position,
      idempotency_key
    ) returning id into v_opportunity_id;
  exception when unique_violation then
    select o.id into v_existing_id
    from public.opportunities as o
    where o.clinic_id = clinic_id and o.idempotency_key = idempotency_key;
    if found then
      return query select v_existing_id, false;
      return;
    end if;
    raise;
  end;

  insert into public.opportunity_stage_events (
    clinic_id,
    opportunity_id,
    from_stage_id,
    to_stage_id,
    from_status,
    to_status,
    actor_id
  ) values (
    clinic_id,
    v_opportunity_id,
    null,
    v_stage_id,
    null,
    'open',
    v_actor_id
  );
  perform app_private.log_activity(
    clinic_id,
    'opportunity.created',
    jsonb_build_object(
      'pipeline_id', v_pipeline_id,
      'stage_id', v_stage_id,
      'status', 'open'
    ),
    contact_id,
    v_opportunity_id
  );
  perform app_private.log_audit_event(
    clinic_id,
    'opportunity.created',
    'opportunity',
    v_opportunity_id,
    null,
    jsonb_build_object(
      'contact_id', contact_id,
      'pipeline_id', v_pipeline_id,
      'stage_id', v_stage_id,
      'status', 'open',
      'assigned_to_user_id', v_actor_id,
      'amount_cents', amount_cents,
      'version', 1
    ),
    null
  );
  return query select v_opportunity_id, v_has_existing_open;
end;
$$;

alter function public.create_opportunity(
  uuid, uuid, text, bigint, uuid, uuid, boolean, uuid
) owner to postgres;
revoke all on function public.create_opportunity(
  uuid, uuid, text, bigint, uuid, uuid, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.create_opportunity(
  uuid, uuid, text, bigint, uuid, uuid, boolean, uuid
) to authenticated;
