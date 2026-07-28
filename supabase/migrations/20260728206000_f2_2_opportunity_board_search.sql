-- F2.2 review fix — bounded, deterministic board search under caller RLS.

create function public.search_opportunity_board(
  p_clinic_id uuid,
  p_pipeline_id uuid,
  p_search_term text,
  p_status text,
  p_assigned_to_user_id uuid,
  p_initial_source_id uuid,
  p_page integer,
  p_page_size integer
)
returns table (
  id uuid,
  clinic_id uuid,
  contact_id uuid,
  pipeline_id uuid,
  stage_id uuid,
  status text,
  assigned_to_user_id uuid,
  initial_source_id uuid,
  title text,
  amount_cents bigint,
  board_position numeric,
  closed_at timestamptz,
  close_reason text,
  idempotency_key uuid,
  version integer,
  created_at timestamptz,
  updated_at timestamptz,
  contact_name text,
  stage_position integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    o.id,
    o.clinic_id,
    o.contact_id,
    o.pipeline_id,
    o.stage_id,
    o.status,
    o.assigned_to_user_id,
    o.initial_source_id,
    o.title,
    o.amount_cents,
    o.board_position,
    o.closed_at,
    o.close_reason,
    o.idempotency_key,
    o.version,
    o.created_at,
    o.updated_at,
    c.full_name as contact_name,
    ps.position as stage_position
  from public.opportunities as o
  join public.contacts as c
    on c.clinic_id = o.clinic_id
   and c.id = o.contact_id
  join public.pipeline_stages as ps
    on ps.clinic_id = o.clinic_id
   and ps.id = o.stage_id
   and ps.pipeline_id = o.pipeline_id
  where o.clinic_id = p_clinic_id
    and o.pipeline_id = p_pipeline_id
    and (p_status is null or o.status = p_status)
    and (
      p_assigned_to_user_id is null
      or o.assigned_to_user_id = p_assigned_to_user_id
    )
    and (
      p_initial_source_id is null
      or o.initial_source_id = p_initial_source_id
    )
    and (
      coalesce(p_search_term, '') = ''
      or position(lower(p_search_term) in lower(o.title)) > 0
      or position(lower(p_search_term) in lower(c.full_name)) > 0
    )
  order by ps.position, o.board_position, o.id
  limit least(greatest(p_page_size, 1), 100) + 1
  offset (
    (least(greatest(p_page, 1), 1000000) - 1)
    * least(greatest(p_page_size, 1), 100)
  );
$$;

alter function public.search_opportunity_board(
  uuid, uuid, text, text, uuid, uuid, integer, integer
) owner to postgres;
revoke all on function public.search_opportunity_board(
  uuid, uuid, text, text, uuid, uuid, integer, integer
) from public, anon, authenticated;
grant execute on function public.search_opportunity_board(
  uuid, uuid, text, text, uuid, uuid, integer, integer
) to authenticated;
