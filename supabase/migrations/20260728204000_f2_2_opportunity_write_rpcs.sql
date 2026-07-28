-- F2.2 — seis mutações de oportunidades exclusivamente por RPC autorizada.

create function public.create_opportunity(
  clinic_id uuid,
  contact_id uuid,
  title text,
  amount_cents bigint default null,
  initial_source_id uuid default null,
  idempotency_key uuid default null,
  confirmed_existing_open boolean default false
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
  v_pipeline_id uuid;
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

  select p.id into v_pipeline_id
  from public.pipelines as p
  where p.clinic_id = clinic_id and p.is_default and p.archived_at is null
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'default pipeline not found';
  end if;

  select ps.id into v_stage_id
  from public.pipeline_stages as ps
  where ps.clinic_id = clinic_id and ps.pipeline_id = v_pipeline_id
    and ps.stage_kind = 'open'
  order by ps.position, ps.id
  limit 1;
  if not found then
    raise exception using errcode = 'P0002', message = 'initial stage not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(clinic_id::text || ':' || contact_id::text || ':' || v_pipeline_id::text, 1)
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
      clinic_id, contact_id, pipeline_id, stage_id, status,
      assigned_to_user_id, initial_source_id, title, amount_cents,
      board_position, idempotency_key
    ) values (
      clinic_id, contact_id, v_pipeline_id, v_stage_id, 'open',
      v_actor_id, initial_source_id, trim(title), amount_cents,
      v_board_position, idempotency_key
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
    clinic_id, opportunity_id, from_stage_id, to_stage_id,
    from_status, to_status, actor_id
  ) values (
    clinic_id, v_opportunity_id, null, v_stage_id,
    null, 'open', v_actor_id
  );
  perform app_private.log_activity(
    clinic_id, 'opportunity.created',
    jsonb_build_object('stage_id', v_stage_id, 'status', 'open'),
    contact_id, v_opportunity_id
  );
  perform app_private.log_audit_event(
    clinic_id, 'opportunity.created', 'opportunity', v_opportunity_id, null,
    jsonb_build_object(
      'contact_id', contact_id,
      'stage_id', v_stage_id,
      'status', 'open',
      'assigned_to_user_id', v_actor_id,
      'amount_cents', amount_cents,
      'version', 1
    ), null
  );
  return query select v_opportunity_id, v_has_existing_open;
end;
$$;

create function public.update_opportunity(
  clinic_id uuid,
  opportunity_id uuid,
  title text,
  amount_cents bigint,
  initial_source_id uuid,
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
  v_opportunity public.opportunities;
  v_new_version integer;
begin
  if v_actor_id is null or not app_private.is_clinic_member(clinic_id) then
    raise exception using errcode = '42501', message = 'opportunity access denied';
  end if;
  select o.* into v_opportunity from public.opportunities as o
  where o.clinic_id = clinic_id and o.id = opportunity_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'opportunity not found'; end if;
  if not (
    app_private.has_permission(clinic_id, 'opportunity.edit_all')
    or (
      v_opportunity.assigned_to_user_id = v_actor_id
      and app_private.has_permission(clinic_id, 'opportunity.edit_own')
    )
  ) then raise exception using errcode = '42501', message = 'opportunity access denied'; end if;
  if title is null or char_length(trim(title)) not between 2 and 160
    or (amount_cents is not null and amount_cents < 0)
    or expected_version is null or expected_version < 1
    or (initial_source_id is not null and not exists (
      select 1 from public.lead_sources as ls
      where ls.clinic_id = clinic_id and ls.id = initial_source_id
    ))
  then raise exception using errcode = '22023', message = 'invalid opportunity'; end if;
  if v_opportunity.version <> expected_version then
    raise exception using errcode = 'P4091', message = 'opportunity version conflict';
  end if;
  update public.opportunities as o
  set title = trim(title), amount_cents = amount_cents,
      initial_source_id = initial_source_id, version = o.version + 1
  where o.clinic_id = clinic_id and o.id = opportunity_id
    and o.version = expected_version
  returning o.version into v_new_version;
  if not found then raise exception using errcode = 'P4091', message = 'opportunity version conflict'; end if;
  perform app_private.log_audit_event(
    clinic_id, 'opportunity.updated', 'opportunity', opportunity_id,
    jsonb_build_object(
      'amount_cents', v_opportunity.amount_cents,
      'initial_source_id', v_opportunity.initial_source_id,
      'version', v_opportunity.version
    ),
    jsonb_build_object(
      'amount_cents', amount_cents,
      'initial_source_id', initial_source_id,
      'version', v_new_version
    ), null
  );
  return v_new_version;
end;
$$;

create function public.move_opportunity(
  clinic_id uuid,
  opportunity_id uuid,
  target_stage_id uuid,
  expected_version integer,
  before_opportunity_id uuid default null,
  after_opportunity_id uuid default null
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
  v_opportunity public.opportunities;
  v_target public.pipeline_stages;
  v_before_position numeric;
  v_after_position numeric;
  v_board_position numeric;
  v_new_version integer;
begin
  if v_actor_id is null or not app_private.is_clinic_member(clinic_id) then
    raise exception using errcode = '42501', message = 'opportunity access denied';
  end if;
  select o.* into v_opportunity from public.opportunities as o
  where o.clinic_id = clinic_id and o.id = opportunity_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'opportunity not found'; end if;
  if not (
    app_private.has_permission(clinic_id, 'opportunity.move_all')
    or (
      v_opportunity.assigned_to_user_id = v_actor_id
      and app_private.has_permission(clinic_id, 'opportunity.move_own')
    )
  ) then raise exception using errcode = '42501', message = 'opportunity access denied'; end if;
  if v_opportunity.status <> 'open' or v_opportunity.version <> expected_version then
    raise exception using errcode = 'P4091', message = 'opportunity version conflict';
  end if;
  select ps.* into v_target from public.pipeline_stages as ps
  where ps.clinic_id = clinic_id and ps.id = target_stage_id
    and ps.pipeline_id = v_opportunity.pipeline_id and ps.stage_kind = 'open';
  if not found or target_stage_id = v_opportunity.stage_id then
    raise exception using errcode = '22023', message = 'invalid target stage';
  end if;

  if before_opportunity_id is not null then
    select o.board_position into v_before_position from public.opportunities as o
    where o.clinic_id = clinic_id and o.id = before_opportunity_id
      and o.stage_id = target_stage_id and o.status = 'open' for share;
    if not found then raise exception using errcode = '22023', message = 'invalid board neighbor'; end if;
  end if;
  if after_opportunity_id is not null then
    select o.board_position into v_after_position from public.opportunities as o
    where o.clinic_id = clinic_id and o.id = after_opportunity_id
      and o.stage_id = target_stage_id and o.status = 'open' for share;
    if not found then raise exception using errcode = '22023', message = 'invalid board neighbor'; end if;
  end if;
  if v_before_position is not null and v_after_position is not null then
    if v_before_position >= v_after_position then
      raise exception using errcode = '22023', message = 'invalid board neighbors';
    end if;
    v_board_position := (v_before_position + v_after_position) / 2;
  elsif v_before_position is not null then
    v_board_position := v_before_position + 1000;
  elsif v_after_position is not null then
    v_board_position := v_after_position - 1000;
  else
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(target_stage_id::text, 0)
    );
    select coalesce(max(o.board_position), 0) + 1000 into v_board_position
    from public.opportunities as o
    where o.clinic_id = clinic_id and o.stage_id = target_stage_id and o.status = 'open';
  end if;

  update public.opportunities as o
  set stage_id = target_stage_id, board_position = v_board_position,
      version = o.version + 1
  where o.clinic_id = clinic_id and o.id = opportunity_id
    and o.version = expected_version and o.status = 'open'
  returning o.version into v_new_version;
  if not found then raise exception using errcode = 'P4091', message = 'opportunity version conflict'; end if;
  insert into public.opportunity_stage_events (
    clinic_id, opportunity_id, from_stage_id, to_stage_id,
    from_status, to_status, actor_id
  ) values (
    clinic_id, opportunity_id, v_opportunity.stage_id, target_stage_id,
    'open', 'open', v_actor_id
  );
  perform app_private.log_activity(
    clinic_id, 'opportunity.stage_changed',
    jsonb_build_object('from_stage_id', v_opportunity.stage_id, 'to_stage_id', target_stage_id),
    v_opportunity.contact_id, opportunity_id
  );
  perform app_private.log_audit_event(
    clinic_id, 'opportunity.stage_changed', 'opportunity', opportunity_id,
    jsonb_build_object('stage_id', v_opportunity.stage_id, 'status', 'open', 'version', v_opportunity.version),
    jsonb_build_object('stage_id', target_stage_id, 'status', 'open', 'version', v_new_version), null
  );
  return v_new_version;
end;
$$;

create function public.close_opportunity(
  clinic_id uuid,
  opportunity_id uuid,
  target_status text,
  close_reason text,
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
  v_opportunity public.opportunities;
  v_target_stage_id uuid;
  v_new_version integer;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'opportunity.close')
  then raise exception using errcode = '42501', message = 'opportunity access denied'; end if;
  select o.* into v_opportunity from public.opportunities as o
  where o.clinic_id = clinic_id and o.id = opportunity_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'opportunity not found'; end if;
  if not (
    app_private.has_permission(clinic_id, 'opportunity.move_all')
    or app_private.has_permission(clinic_id, 'opportunity.edit_all')
    or (
      v_opportunity.assigned_to_user_id = v_actor_id
      and (
        app_private.has_permission(clinic_id, 'opportunity.move_own')
        or app_private.has_permission(clinic_id, 'opportunity.edit_own')
      )
    )
  ) then raise exception using errcode = '42501', message = 'opportunity access denied'; end if;
  if target_status not in ('won', 'lost')
    or expected_version is null or expected_version < 1
    or (close_reason is not null and char_length(trim(close_reason)) > 500)
    or (target_status = 'lost' and (close_reason is null or char_length(trim(close_reason)) < 2))
  then raise exception using errcode = '22023', message = 'invalid opportunity close'; end if;
  if v_opportunity.status <> 'open' or v_opportunity.version <> expected_version then
    raise exception using errcode = 'P4091', message = 'opportunity version conflict';
  end if;
  select ps.id into v_target_stage_id from public.pipeline_stages as ps
  where ps.clinic_id = clinic_id and ps.pipeline_id = v_opportunity.pipeline_id
    and ps.stage_kind = target_status;
  if not found then raise exception using errcode = 'P0002', message = 'closing stage not found'; end if;
  update public.opportunities as o
  set stage_id = v_target_stage_id, status = target_status,
      closed_at = statement_timestamp(), close_reason = nullif(trim(close_reason), ''),
      version = o.version + 1
  where o.clinic_id = clinic_id and o.id = opportunity_id
    and o.version = expected_version and o.status = 'open'
  returning o.version into v_new_version;
  if not found then raise exception using errcode = 'P4091', message = 'opportunity version conflict'; end if;
  insert into public.opportunity_stage_events (
    clinic_id, opportunity_id, from_stage_id, to_stage_id,
    from_status, to_status, reason, actor_id
  ) values (
    clinic_id, opportunity_id, v_opportunity.stage_id, v_target_stage_id,
    'open', target_status, nullif(trim(close_reason), ''), v_actor_id
  );
  perform app_private.log_activity(
    clinic_id, case when target_status = 'won' then 'opportunity.won' else 'opportunity.lost' end,
    jsonb_build_object('from_stage_id', v_opportunity.stage_id, 'to_stage_id', v_target_stage_id, 'status', target_status),
    v_opportunity.contact_id, opportunity_id
  );
  perform app_private.log_audit_event(
    clinic_id, case when target_status = 'won' then 'opportunity.won' else 'opportunity.lost' end,
    'opportunity', opportunity_id,
    jsonb_build_object('stage_id', v_opportunity.stage_id, 'status', 'open', 'version', v_opportunity.version),
    jsonb_build_object('stage_id', v_target_stage_id, 'status', target_status, 'close_reason', nullif(trim(close_reason), ''), 'version', v_new_version), null
  );
  return v_new_version;
end;
$$;

create function public.reopen_opportunity(
  clinic_id uuid,
  opportunity_id uuid,
  target_stage_id uuid,
  reason text,
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
  v_opportunity public.opportunities;
  v_new_version integer;
  v_board_position numeric;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'opportunity.reopen')
  then raise exception using errcode = '42501', message = 'opportunity access denied'; end if;
  perform app_private.require_aal2();
  if reason is null or char_length(trim(reason)) not between 2 and 500
    or expected_version is null or expected_version < 1
  then raise exception using errcode = '22023', message = 'invalid reopen reason'; end if;
  select o.* into v_opportunity from public.opportunities as o
  where o.clinic_id = clinic_id and o.id = opportunity_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'opportunity not found'; end if;
  if v_opportunity.status = 'open'
    or v_opportunity.closed_at is null
    or v_opportunity.closed_at < statement_timestamp() - interval '24 hours'
  then raise exception using errcode = '22023', message = 'opportunity cannot be reopened'; end if;
  if v_opportunity.version <> expected_version then
    raise exception using errcode = 'P4091', message = 'opportunity version conflict';
  end if;
  if not exists (
    select 1 from public.pipeline_stages as ps
    where ps.clinic_id = clinic_id and ps.id = target_stage_id
      and ps.pipeline_id = v_opportunity.pipeline_id and ps.stage_kind = 'open'
  ) then raise exception using errcode = '22023', message = 'invalid target stage'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_stage_id::text, 0));
  select coalesce(max(o.board_position), 0) + 1000 into v_board_position
  from public.opportunities as o
  where o.clinic_id = clinic_id and o.stage_id = target_stage_id and o.status = 'open';
  update public.opportunities as o
  set stage_id = target_stage_id, status = 'open', board_position = v_board_position,
      closed_at = null, close_reason = null, version = o.version + 1
  where o.clinic_id = clinic_id and o.id = opportunity_id
    and o.version = expected_version and o.status <> 'open'
  returning o.version into v_new_version;
  if not found then raise exception using errcode = 'P4091', message = 'opportunity version conflict'; end if;
  insert into public.opportunity_stage_events (
    clinic_id, opportunity_id, from_stage_id, to_stage_id,
    from_status, to_status, reason, actor_id
  ) values (
    clinic_id, opportunity_id, v_opportunity.stage_id, target_stage_id,
    v_opportunity.status, 'open', trim(reason), v_actor_id
  );
  perform app_private.log_activity(
    clinic_id, 'opportunity.reopened',
    jsonb_build_object('from_stage_id', v_opportunity.stage_id, 'to_stage_id', target_stage_id, 'previous_status', v_opportunity.status),
    v_opportunity.contact_id, opportunity_id
  );
  perform app_private.log_audit_event(
    clinic_id, 'opportunity.reopened', 'opportunity', opportunity_id,
    jsonb_build_object('stage_id', v_opportunity.stage_id, 'status', v_opportunity.status, 'version', v_opportunity.version),
    jsonb_build_object('stage_id', target_stage_id, 'status', 'open', 'reason', trim(reason), 'version', v_new_version), null
  );
  return v_new_version;
end;
$$;

create function public.assign_opportunity(
  clinic_id uuid,
  opportunity_id uuid,
  assigned_to_user_id uuid,
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
  v_opportunity public.opportunities;
  v_assigned_to_user_id uuid := assigned_to_user_id;
  v_new_version integer;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'opportunity.edit_all')
  then raise exception using errcode = '42501', message = 'opportunity access denied'; end if;
  if assigned_to_user_id is null or expected_version is null or expected_version < 1
    or not exists (
      select 1 from public.clinic_members as cm
      where cm.clinic_id = clinic_id and cm.user_id = assigned_to_user_id
        and cm.status = 'active'
    )
  then raise exception using errcode = '22023', message = 'invalid opportunity assignee'; end if;
  select o.* into v_opportunity from public.opportunities as o
  where o.clinic_id = clinic_id and o.id = opportunity_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'opportunity not found'; end if;
  if v_opportunity.version <> expected_version then
    raise exception using errcode = 'P4091', message = 'opportunity version conflict';
  end if;
  update public.opportunities as o
  set assigned_to_user_id = v_assigned_to_user_id,
      version = o.version + 1
  where o.clinic_id = clinic_id and o.id = opportunity_id and o.version = expected_version
  returning o.version into v_new_version;
  if not found then raise exception using errcode = 'P4091', message = 'opportunity version conflict'; end if;
  perform app_private.log_audit_event(
    clinic_id, 'opportunity.assigned', 'opportunity', opportunity_id,
    jsonb_build_object('assigned_to_user_id', v_opportunity.assigned_to_user_id, 'version', v_opportunity.version),
    jsonb_build_object('assigned_to_user_id', assigned_to_user_id, 'version', v_new_version), null
  );
  return v_new_version;
end;
$$;

alter function public.create_opportunity(uuid, uuid, text, bigint, uuid, uuid, boolean) owner to postgres;
alter function public.update_opportunity(uuid, uuid, text, bigint, uuid, integer) owner to postgres;
alter function public.move_opportunity(uuid, uuid, uuid, integer, uuid, uuid) owner to postgres;
alter function public.close_opportunity(uuid, uuid, text, text, integer) owner to postgres;
alter function public.reopen_opportunity(uuid, uuid, uuid, text, integer) owner to postgres;
alter function public.assign_opportunity(uuid, uuid, uuid, integer) owner to postgres;

revoke all on function public.create_opportunity(uuid, uuid, text, bigint, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.update_opportunity(uuid, uuid, text, bigint, uuid, integer) from public, anon, authenticated;
revoke all on function public.move_opportunity(uuid, uuid, uuid, integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.close_opportunity(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.reopen_opportunity(uuid, uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.assign_opportunity(uuid, uuid, uuid, integer) from public, anon, authenticated;

grant execute on function public.create_opportunity(uuid, uuid, text, bigint, uuid, uuid, boolean) to authenticated;
grant execute on function public.update_opportunity(uuid, uuid, text, bigint, uuid, integer) to authenticated;
grant execute on function public.move_opportunity(uuid, uuid, uuid, integer, uuid, uuid) to authenticated;
grant execute on function public.close_opportunity(uuid, uuid, text, text, integer) to authenticated;
grant execute on function public.reopen_opportunity(uuid, uuid, uuid, text, integer) to authenticated;
grant execute on function public.assign_opportunity(uuid, uuid, uuid, integer) to authenticated;
