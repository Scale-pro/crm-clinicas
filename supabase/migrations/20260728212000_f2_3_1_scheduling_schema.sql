-- F2.3.1 — profissionais, procedimentos e disponibilidade semanal recorrente.

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid,
  display_name text not null check (char_length(trim(display_name)) between 2 and 160),
  email text check (
    email is null or (
      email = lower(trim(email))
      and char_length(email) between 3 and 320
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  ),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  professional_registration_type text check (
    professional_registration_type is null
    or char_length(trim(professional_registration_type)) between 2 and 40
  ),
  professional_registration_number text check (
    professional_registration_number is null
    or char_length(trim(professional_registration_number)) between 1 and 80
  ),
  color text not null default '#2563EB' check (color ~ '^#[0-9A-F]{6}$'),
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text check (notes is null or char_length(notes) <= 2000),
  creation_idempotency_key uuid not null,
  version integer not null default 1 check (version >= 1),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz,
  constraint professionals_clinic_id_id_key unique (clinic_id, id),
  constraint professionals_clinic_user_fk foreign key (clinic_id, user_id)
    references public.clinic_members(clinic_id, user_id)
    on update cascade on delete set null (user_id),
  constraint professionals_archive_status_check check (
    archived_at is null or status = 'inactive'
  )
);

create table public.professional_specialties (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_id uuid not null,
  name text not null check (char_length(trim(name)) between 2 and 80),
  created_at timestamptz not null default statement_timestamp(),
  constraint professional_specialties_professional_fk
    foreign key (clinic_id, professional_id)
    references public.professionals(clinic_id, id) on delete cascade
);

create table public.procedures (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text check (description is null or char_length(description) <= 2000),
  category text check (category is null or char_length(trim(category)) between 1 and 100),
  default_duration_minutes integer not null check (default_duration_minutes between 5 and 1440),
  base_price_cents bigint not null check (base_price_cents between 0 and 9007199254740991),
  color text not null default '#2563EB' check (color ~ '^#[0-9A-F]{6}$'),
  status text not null default 'active' check (status in ('active', 'inactive')),
  creation_idempotency_key uuid not null,
  version integer not null default 1 check (version >= 1),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz,
  constraint procedures_clinic_id_id_key unique (clinic_id, id),
  constraint procedures_archive_status_check check (
    archived_at is null or status = 'inactive'
  )
);

create table public.professional_procedures (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_id uuid not null,
  procedure_id uuid not null,
  duration_minutes_override integer check (
    duration_minutes_override is null or duration_minutes_override between 5 and 1440
  ),
  price_cents_override bigint check (
    price_cents_override is null or price_cents_override between 0 and 9007199254740991
  ),
  status text not null default 'active' check (status in ('active', 'inactive')),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz,
  constraint professional_procedures_clinic_pair_key
    unique (clinic_id, professional_id, procedure_id),
  constraint professional_procedures_professional_fk
    foreign key (clinic_id, professional_id)
    references public.professionals(clinic_id, id) on delete cascade,
  constraint professional_procedures_procedure_fk
    foreign key (clinic_id, procedure_id)
    references public.procedures(clinic_id, id) on delete cascade,
  constraint professional_procedures_archive_status_check check (
    archived_at is null or status = 'inactive'
  )
);

create table public.professional_weekly_availability (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 1 and 1440),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint professional_weekly_availability_interval_check
    check (start_minute < end_minute),
  constraint professional_weekly_availability_exact_key
    unique (clinic_id, professional_id, weekday, start_minute, end_minute),
  constraint professional_weekly_availability_professional_fk
    foreign key (clinic_id, professional_id)
    references public.professionals(clinic_id, id) on delete cascade
);
comment on column public.professional_weekly_availability.weekday is
  'ISO-8601: 1=segunda-feira e 7=domingo; horário local no timezone IANA da clínica.';

create unique index professionals_clinic_creation_idempotency_idx
  on public.professionals (clinic_id, creation_idempotency_key);
create unique index professionals_clinic_active_user_idx
  on public.professionals (clinic_id, user_id)
  where user_id is not null and status = 'active' and archived_at is null;
create index professionals_clinic_status_name_idx
  on public.professionals (clinic_id, status, lower(trim(display_name)), id);
create unique index professional_specialties_clinic_name_idx
  on public.professional_specialties (clinic_id, professional_id, lower(trim(name)));
create index professional_specialties_clinic_search_idx
  on public.professional_specialties (clinic_id, lower(trim(name)), professional_id);
create unique index procedures_clinic_creation_idempotency_idx
  on public.procedures (clinic_id, creation_idempotency_key);
create unique index procedures_clinic_active_name_idx
  on public.procedures (clinic_id, lower(trim(name)))
  where status = 'active' and archived_at is null;
create index procedures_clinic_status_name_idx
  on public.procedures (clinic_id, status, lower(trim(name)), id);
create index professional_procedures_clinic_professional_idx
  on public.professional_procedures (clinic_id, professional_id, status, procedure_id);
create index professional_procedures_clinic_procedure_idx
  on public.professional_procedures (clinic_id, procedure_id, status, professional_id);
create index professional_weekly_availability_clinic_professional_idx
  on public.professional_weekly_availability
  (clinic_id, professional_id, weekday, start_minute, end_minute);

create trigger professionals_set_updated_at before update on public.professionals
for each row execute function public.set_updated_at();
create trigger procedures_set_updated_at before update on public.procedures
for each row execute function public.set_updated_at();
create trigger professional_procedures_set_updated_at before update on public.professional_procedures
for each row execute function public.set_updated_at();
create trigger professional_weekly_availability_set_updated_at
before update on public.professional_weekly_availability
for each row execute function public.set_updated_at();

create function app_private.prevent_professional_availability_overlap()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
#variable_conflict use_variable
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.clinic_id::text || ':' || new.professional_id::text, 0)
  );
  if exists (
    select 1
    from public.professional_weekly_availability as availability
    where availability.clinic_id = new.clinic_id
      and availability.professional_id = new.professional_id
      and availability.weekday = new.weekday
      and availability.id <> new.id
      and availability.start_minute < new.end_minute
      and new.start_minute < availability.end_minute
  ) then
    raise exception using errcode = 'P4309', message = 'availability overlap';
  end if;
  return new;
end;
$$;
alter function app_private.prevent_professional_availability_overlap() owner to postgres;
revoke all on function app_private.prevent_professional_availability_overlap()
from public, anon, authenticated;

create trigger professional_weekly_availability_prevent_overlap
before insert or update on public.professional_weekly_availability
for each row execute function app_private.prevent_professional_availability_overlap();

alter table public.professionals enable row level security;
alter table public.professionals force row level security;
alter table public.professional_specialties enable row level security;
alter table public.professional_specialties force row level security;
alter table public.procedures enable row level security;
alter table public.procedures force row level security;
alter table public.professional_procedures enable row level security;
alter table public.professional_procedures force row level security;
alter table public.professional_weekly_availability enable row level security;
alter table public.professional_weekly_availability force row level security;

revoke all on table
  public.professionals,
  public.professional_specialties,
  public.procedures,
  public.professional_procedures,
  public.professional_weekly_availability
from public, anon, authenticated;

create policy professionals_select on public.professionals for select to authenticated
using (public.current_user_has_permission(clinic_id, 'professional.view'));
create policy professional_specialties_select on public.professional_specialties
for select to authenticated
using (public.current_user_has_permission(clinic_id, 'professional.view'));
create policy procedures_select on public.procedures for select to authenticated
using (public.current_user_has_permission(clinic_id, 'procedure.view'));
create policy professional_procedures_select on public.professional_procedures
for select to authenticated
using (
  public.current_user_has_permission(clinic_id, 'professional.view')
  and public.current_user_has_permission(clinic_id, 'procedure.view')
);
create policy professional_weekly_availability_select
on public.professional_weekly_availability for select to authenticated
using (public.current_user_has_permission(clinic_id, 'professional.view'));

grant select on table
  public.professionals,
  public.professional_specialties,
  public.procedures,
  public.professional_procedures,
  public.professional_weekly_availability
to authenticated;

create function public.search_professionals(
  p_clinic_id uuid,
  p_search_term text,
  p_status text,
  p_specialty text,
  p_page integer,
  p_page_size integer
)
returns table (
  id uuid,
  display_name text,
  color text,
  status text,
  specialties text[],
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with filtered as (
    select professional.id, professional.display_name, professional.color, professional.status,
      coalesce(array(
        select specialty.name
        from public.professional_specialties as specialty
        where specialty.clinic_id = professional.clinic_id
          and specialty.professional_id = professional.id
        order by lower(trim(specialty.name)), specialty.id
      ), '{}'::text[]) as specialties
    from public.professionals as professional
    where professional.clinic_id = p_clinic_id
      and professional.archived_at is null
      and (p_status is null or professional.status = p_status)
      and (
        coalesce(trim(p_search_term), '') = ''
        or position(lower(trim(p_search_term)) in lower(professional.display_name)) > 0
      )
      and (
        p_specialty is null
        or exists (
          select 1 from public.professional_specialties as specialty
          where specialty.clinic_id = professional.clinic_id
            and specialty.professional_id = professional.id
            and lower(trim(specialty.name)) = lower(trim(p_specialty))
        )
      )
  )
  select filtered.id, filtered.display_name, filtered.color, filtered.status,
    filtered.specialties, count(*) over() as total_count
  from filtered
  order by lower(trim(filtered.display_name)), filtered.id
  limit case when p_page_size between 1 and 100 then p_page_size else 0 end
  offset case when p_page >= 1 and p_page_size between 1 and 100
    then (p_page - 1)::bigint * p_page_size else 0 end;
$$;
alter function public.search_professionals(uuid, text, text, text, integer, integer)
owner to postgres;
revoke all on function public.search_professionals(uuid, text, text, text, integer, integer)
from public, anon;
grant execute on function public.search_professionals(uuid, text, text, text, integer, integer)
to authenticated;

create function public.search_procedures(
  p_clinic_id uuid,
  p_search_term text,
  p_status text,
  p_page integer,
  p_page_size integer
)
returns table (
  id uuid,
  name text,
  category text,
  default_duration_minutes integer,
  base_price_cents bigint,
  color text,
  status text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with filtered as (
    select procedure.id, procedure.name, procedure.category,
      procedure.default_duration_minutes, procedure.base_price_cents,
      procedure.color, procedure.status
    from public.procedures as procedure
    where procedure.clinic_id = p_clinic_id
      and procedure.archived_at is null
      and (p_status is null or procedure.status = p_status)
      and (
        coalesce(trim(p_search_term), '') = ''
        or position(lower(trim(p_search_term)) in lower(procedure.name)) > 0
      )
  )
  select filtered.*, count(*) over() as total_count
  from filtered
  order by lower(trim(filtered.name)), filtered.id
  limit case when p_page_size between 1 and 100 then p_page_size else 0 end
  offset case when p_page >= 1 and p_page_size between 1 and 100
    then (p_page - 1)::bigint * p_page_size else 0 end;
$$;
alter function public.search_procedures(uuid, text, text, integer, integer) owner to postgres;
revoke all on function public.search_procedures(uuid, text, text, integer, integer)
from public, anon;
grant execute on function public.search_procedures(uuid, text, text, integer, integer)
to authenticated;

create function public.search_professional_procedures(
  p_clinic_id uuid,
  p_professional_id uuid,
  p_procedure_id uuid,
  p_page integer,
  p_page_size integer
)
returns table (
  id uuid,
  professional_id uuid,
  procedure_id uuid,
  professional_name text,
  procedure_name text,
  default_duration_minutes integer,
  effective_duration_minutes integer,
  has_duration_override boolean,
  base_price_cents bigint,
  effective_price_cents bigint,
  has_price_override boolean,
  version integer,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select link.id, link.professional_id, link.procedure_id,
    professional.display_name, procedure.name,
    procedure.default_duration_minutes,
    coalesce(link.duration_minutes_override, procedure.default_duration_minutes),
    link.duration_minutes_override is not null,
    procedure.base_price_cents,
    coalesce(link.price_cents_override, procedure.base_price_cents),
    link.price_cents_override is not null,
    link.version,
    count(*) over()
  from public.professional_procedures as link
  join public.professionals as professional
    on professional.clinic_id = link.clinic_id and professional.id = link.professional_id
  join public.procedures as procedure
    on procedure.clinic_id = link.clinic_id and procedure.id = link.procedure_id
  where link.clinic_id = p_clinic_id
    and link.status = 'active' and link.archived_at is null
    and professional.status = 'active' and professional.archived_at is null
    and procedure.status = 'active' and procedure.archived_at is null
    and (p_professional_id is null or link.professional_id = p_professional_id)
    and (p_procedure_id is null or link.procedure_id = p_procedure_id)
  order by lower(trim(professional.display_name)), professional.id,
    lower(trim(procedure.name)), procedure.id
  limit case when p_page_size between 1 and 100 then p_page_size else 0 end
  offset case when p_page >= 1 and p_page_size between 1 and 100
    then (p_page - 1)::bigint * p_page_size else 0 end;
$$;
alter function public.search_professional_procedures(uuid, uuid, uuid, integer, integer)
owner to postgres;
revoke all on function public.search_professional_procedures(uuid, uuid, uuid, integer, integer)
from public, anon;
grant execute on function public.search_professional_procedures(uuid, uuid, uuid, integer, integer)
to authenticated;
