-- F2.2 — pipelines, etapas e bootstrap automático do pipeline padrão.

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint pipelines_clinic_id_key unique (clinic_id, id),
  constraint pipelines_default_not_archived_check check (
    not is_default or archived_at is null
  )
);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  pipeline_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 60),
  stage_kind text not null check (stage_kind in ('open', 'won', 'lost')),
  position integer not null check (position > 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint pipeline_stages_pipeline_fkey
    foreign key (clinic_id, pipeline_id)
    references public.pipelines (clinic_id, id)
    on update cascade
    on delete cascade,
  constraint pipeline_stages_clinic_id_key unique (clinic_id, id),
  constraint pipeline_stages_pipeline_id_kind_key
    unique (pipeline_id, id, stage_kind),
  constraint pipeline_stages_pipeline_position_key
    unique (pipeline_id, position) deferrable initially deferred
);

create unique index pipelines_one_active_default_idx
  on public.pipelines (clinic_id)
  where is_default = true and archived_at is null;
create index pipelines_clinic_default_idx
  on public.pipelines (clinic_id, is_default);

create unique index pipeline_stages_one_won_idx
  on public.pipeline_stages (pipeline_id)
  where stage_kind = 'won';
create unique index pipeline_stages_one_lost_idx
  on public.pipeline_stages (pipeline_id)
  where stage_kind = 'lost';
create index pipeline_stages_clinic_pipeline_position_idx
  on public.pipeline_stages (clinic_id, pipeline_id, position);

create trigger pipelines_set_updated_at
before update on public.pipelines
for each row execute function public.set_updated_at();
create trigger pipeline_stages_set_updated_at
before update on public.pipeline_stages
for each row execute function public.set_updated_at();

create function app_private.protect_pipeline_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stage_kind is distinct from old.stage_kind
    or new.pipeline_id is distinct from old.pipeline_id
    or new.clinic_id is distinct from old.clinic_id
  then
    raise exception using errcode = '22023', message = 'immutable pipeline stage fields';
  end if;
  return new;
end;
$$;
alter function app_private.protect_pipeline_stage() owner to postgres;
revoke all on function app_private.protect_pipeline_stage()
from public, anon, authenticated;

create trigger pipeline_stages_protect
before update on public.pipeline_stages
for each row execute function app_private.protect_pipeline_stage();

create function app_private.bootstrap_default_pipeline(p_clinic_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_pipeline_id uuid;
begin
  if p_clinic_id is null or not exists (
    select 1 from public.clinics as c where c.id = p_clinic_id
  ) then
    raise exception using errcode = '22023', message = 'invalid clinic';
  end if;

  select p.id into v_pipeline_id
  from public.pipelines as p
  where p.clinic_id = p_clinic_id
    and p.is_default
    and p.archived_at is null
  for update;

  if not found then
    insert into public.pipelines (clinic_id, name, is_default)
    values (p_clinic_id, 'Pipeline principal', true)
    returning id into v_pipeline_id;
  end if;

  if not exists (
    select 1 from public.pipeline_stages as ps
    where ps.pipeline_id = v_pipeline_id
  ) then
    insert into public.pipeline_stages (
      clinic_id, pipeline_id, name, stage_kind, position
    ) values
      (p_clinic_id, v_pipeline_id, 'Novo lead', 'open', 100),
      (p_clinic_id, v_pipeline_id, 'Contato feito', 'open', 200),
      (p_clinic_id, v_pipeline_id, 'Reunião agendada', 'open', 300),
      (p_clinic_id, v_pipeline_id, 'Ganho', 'won', 900),
      (p_clinic_id, v_pipeline_id, 'Perdido', 'lost', 1000);
  end if;

  return v_pipeline_id;
end;
$$;
alter function app_private.bootstrap_default_pipeline(uuid) owner to postgres;
revoke all on function app_private.bootstrap_default_pipeline(uuid)
from public, anon, authenticated;

create function app_private.bootstrap_default_pipeline_after_clinic_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.bootstrap_default_pipeline(new.id);
  return new;
end;
$$;
alter function app_private.bootstrap_default_pipeline_after_clinic_insert()
owner to postgres;
revoke all on function app_private.bootstrap_default_pipeline_after_clinic_insert()
from public, anon, authenticated;

create trigger clinics_bootstrap_default_pipeline
after insert on public.clinics
for each row execute function app_private.bootstrap_default_pipeline_after_clinic_insert();

do $$
declare
  v_clinic_id uuid;
begin
  for v_clinic_id in select c.id from public.clinics as c order by c.id loop
    perform app_private.bootstrap_default_pipeline(v_clinic_id);
  end loop;
end;
$$;

alter table public.pipelines enable row level security;
alter table public.pipelines force row level security;
alter table public.pipeline_stages enable row level security;
alter table public.pipeline_stages force row level security;

revoke all on table public.pipelines, public.pipeline_stages
from public, anon, authenticated;

create policy pipelines_select
on public.pipelines
for select
to authenticated
using (clinic_id in (select public.current_user_clinic_ids()));

create policy pipeline_stages_select
on public.pipeline_stages
for select
to authenticated
using (clinic_id in (select public.current_user_clinic_ids()));

grant select on table public.pipelines, public.pipeline_stages to authenticated;
