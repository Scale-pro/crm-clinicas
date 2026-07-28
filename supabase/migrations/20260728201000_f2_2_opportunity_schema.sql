-- F2.2 — oportunidades, integridade estrutural, índices e RLS own/all.

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  contact_id uuid not null,
  pipeline_id uuid not null,
  stage_id uuid not null,
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  assigned_to_user_id uuid,
  initial_source_id uuid,
  title text not null check (char_length(trim(title)) between 2 and 160),
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  board_position numeric not null,
  closed_at timestamptz,
  close_reason text check (close_reason is null or char_length(trim(close_reason)) <= 500),
  idempotency_key uuid,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint opportunities_clinic_id_key unique (clinic_id, id),
  constraint opportunities_contact_fkey
    foreign key (clinic_id, contact_id)
    references public.contacts (clinic_id, id)
    on update cascade on delete restrict,
  constraint opportunities_pipeline_fkey
    foreign key (clinic_id, pipeline_id)
    references public.pipelines (clinic_id, id)
    on update cascade on delete restrict,
  constraint opportunities_source_fkey
    foreign key (clinic_id, initial_source_id)
    references public.lead_sources (clinic_id, id)
    on update cascade on delete restrict,
  constraint opportunities_assignee_fkey
    foreign key (clinic_id, assigned_to_user_id)
    references public.clinic_members (clinic_id, user_id)
    on update cascade
    on delete set null (assigned_to_user_id),
  constraint opportunities_stage_status_fkey
    foreign key (pipeline_id, stage_id, status)
    references public.pipeline_stages (pipeline_id, id, stage_kind)
    on update cascade on delete restrict,
  constraint opportunities_closed_status_check
    check ((status = 'open') = (closed_at is null))
);

create unique index opportunities_clinic_idempotency_key
  on public.opportunities (clinic_id, idempotency_key)
  where idempotency_key is not null;
create index opportunities_clinic_stage_board_idx
  on public.opportunities (clinic_id, stage_id, board_position);
create index opportunities_clinic_status_updated_idx
  on public.opportunities (clinic_id, status, updated_at desc);
create index opportunities_clinic_assignee_open_idx
  on public.opportunities (clinic_id, assigned_to_user_id)
  where status = 'open';
create index opportunities_clinic_contact_idx
  on public.opportunities (clinic_id, contact_id);
create index opportunities_clinic_pipeline_status_idx
  on public.opportunities (clinic_id, pipeline_id, status);

create trigger opportunities_set_updated_at
before update on public.opportunities
for each row execute function public.set_updated_at();

alter table public.opportunities enable row level security;
alter table public.opportunities force row level security;
revoke all on table public.opportunities from public, anon, authenticated;

create policy opportunities_select
on public.opportunities
for select
to authenticated
using (
  clinic_id in (select public.current_user_clinic_ids())
  and (
    public.current_user_has_permission(clinic_id, 'opportunity.view_all')
    or (
      assigned_to_user_id = (select auth.uid())
      and public.current_user_has_permission(clinic_id, 'opportunity.view_own')
    )
  )
);

grant select on table public.opportunities to authenticated;

alter table public.activities add column opportunity_id uuid;
alter table public.activities
  add constraint activities_opportunity_fkey
  foreign key (clinic_id, opportunity_id)
  references public.opportunities (clinic_id, id)
  on update cascade on delete restrict;
create index activities_clinic_opportunity_occurred_idx
  on public.activities (clinic_id, opportunity_id, occurred_at desc)
  where opportunity_id is not null;

drop policy activities_select on public.activities;
create policy activities_select
on public.activities
for select
to authenticated
using (
  clinic_id in (select public.current_user_clinic_ids())
  and (
    contact_id is null
    or exists (
      select 1 from public.contacts as visible_contact
      where visible_contact.clinic_id = activities.clinic_id
        and visible_contact.id = activities.contact_id
    )
  )
  and (
    opportunity_id is null
    or exists (
      select 1 from public.opportunities as visible_opportunity
      where visible_opportunity.clinic_id = activities.clinic_id
        and visible_opportunity.id = activities.opportunity_id
    )
  )
);

create function app_private.log_activity(
  p_clinic_id uuid,
  p_type text,
  p_payload jsonb,
  p_contact_id uuid,
  p_opportunity_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_id uuid;
begin
  if p_clinic_id is null
    or p_contact_id is null
    or p_opportunity_id is null
    or p_type !~ '^[a-z][a-z0-9_.-]*$'
    or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
  then
    raise exception using errcode = '22023', message = 'invalid activity';
  end if;
  insert into public.activities (
    clinic_id, actor_id, type, payload, contact_id, opportunity_id
  ) values (
    p_clinic_id, (select auth.uid()), p_type,
    coalesce(p_payload, '{}'::jsonb), p_contact_id, p_opportunity_id
  ) returning id into v_id;
  return v_id;
end;
$$;
alter function app_private.log_activity(uuid, text, jsonb, uuid, uuid)
owner to postgres;
revoke all on function app_private.log_activity(uuid, text, jsonb, uuid, uuid)
from public, anon, authenticated;
