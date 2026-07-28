-- F2.2 — histórico estrutural append-only das mudanças de etapa/status.

create table public.opportunity_stage_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  opportunity_id uuid not null,
  from_stage_id uuid,
  to_stage_id uuid not null,
  from_status text check (from_status is null or from_status in ('open', 'won', 'lost')),
  to_status text not null check (to_status in ('open', 'won', 'lost')),
  reason text check (reason is null or char_length(trim(reason)) <= 500),
  actor_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint opportunity_stage_events_opportunity_fkey
    foreign key (clinic_id, opportunity_id)
    references public.opportunities (clinic_id, id)
    on update cascade on delete restrict,
  constraint opportunity_stage_events_from_stage_fkey
    foreign key (clinic_id, from_stage_id)
    references public.pipeline_stages (clinic_id, id)
    on update cascade on delete restrict,
  constraint opportunity_stage_events_to_stage_fkey
    foreign key (clinic_id, to_stage_id)
    references public.pipeline_stages (clinic_id, id)
    on update cascade on delete restrict,
  constraint opportunity_stage_events_initial_check check (
    (from_stage_id is null) = (from_status is null)
  )
);

create index opportunity_stage_events_clinic_opportunity_occurred_idx
  on public.opportunity_stage_events (clinic_id, opportunity_id, occurred_at desc);

alter table public.opportunity_stage_events enable row level security;
alter table public.opportunity_stage_events force row level security;
revoke all on table public.opportunity_stage_events from public, anon, authenticated;

create policy opportunity_stage_events_select
on public.opportunity_stage_events
for select
to authenticated
using (
  exists (
    select 1 from public.opportunities as visible_opportunity
    where visible_opportunity.clinic_id = opportunity_stage_events.clinic_id
      and visible_opportunity.id = opportunity_stage_events.opportunity_id
  )
);

grant select on table public.opportunity_stage_events to authenticated;
