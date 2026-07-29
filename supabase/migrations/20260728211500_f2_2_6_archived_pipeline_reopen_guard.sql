-- F2.2.6 review fix — serialize opportunity reopening with pipeline archival.

create or replace function public.reopen_opportunity(
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
  v_pipeline public.pipelines;
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

  select o.* into v_opportunity
  from public.opportunities as o
  where o.clinic_id = clinic_id and o.id = opportunity_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'opportunity not found';
  end if;
  if v_opportunity.status = 'open'
    or v_opportunity.closed_at is null
    or v_opportunity.closed_at < statement_timestamp() - interval '24 hours'
  then raise exception using errcode = '22023', message = 'opportunity cannot be reopened'; end if;
  if v_opportunity.version <> expected_version then
    raise exception using errcode = 'P4091', message = 'opportunity version conflict';
  end if;

  select p.* into v_pipeline
  from public.pipelines as p
  where p.clinic_id = clinic_id
    and p.id = v_opportunity.pipeline_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pipeline not found';
  end if;
  if v_pipeline.archived_at is not null then
    raise exception using errcode = 'P4201', message = 'pipeline archived';
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
  if not found then
    raise exception using errcode = 'P4091', message = 'opportunity version conflict';
  end if;
  insert into public.opportunity_stage_events (
    clinic_id, opportunity_id, from_stage_id, to_stage_id,
    from_status, to_status, reason, actor_id
  ) values (
    clinic_id, opportunity_id, v_opportunity.stage_id, target_stage_id,
    v_opportunity.status, 'open', trim(reason), v_actor_id
  );
  perform app_private.log_activity(
    clinic_id, 'opportunity.reopened',
    jsonb_build_object(
      'from_stage_id', v_opportunity.stage_id,
      'to_stage_id', target_stage_id,
      'previous_status', v_opportunity.status
    ),
    v_opportunity.contact_id, opportunity_id
  );
  perform app_private.log_audit_event(
    clinic_id, 'opportunity.reopened', 'opportunity', opportunity_id,
    jsonb_build_object(
      'stage_id', v_opportunity.stage_id,
      'status', v_opportunity.status,
      'version', v_opportunity.version
    ),
    jsonb_build_object(
      'stage_id', target_stage_id,
      'status', 'open',
      'reason', trim(reason),
      'version', v_new_version
    ),
    null
  );
  return v_new_version;
end;
$$;

alter function public.reopen_opportunity(uuid, uuid, uuid, text, integer)
owner to postgres;
revoke all on function public.reopen_opportunity(uuid, uuid, uuid, text, integer)
from public, anon, authenticated;
grant execute on function public.reopen_opportunity(uuid, uuid, uuid, text, integer)
to authenticated;
