-- F4 — agendamentos da operação diária da clínica.
--
-- Um agendamento liga um contato existente (caso de uso único de criação de
-- contato — ADR-003) a um profissional, em um horário UTC, com preço e duração
-- congelados no momento da marcação. O procedimento pode vir do catálogo ou
-- ser um nome livre (clínicas recém-criadas ainda sem catálogo), nunca os dois.

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  contact_id uuid not null,
  professional_id uuid not null,
  procedure_id uuid,
  custom_procedure_name text check (
    custom_procedure_name is null
    or char_length(trim(custom_procedure_name)) between 2 and 160
  ),
  start_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 5 and 1440),
  price_cents bigint not null check (price_cents between 0 and 9007199254740991),
  status text not null default 'confirmed' check (
    status in ('scheduled', 'confirmed', 'arrived', 'in_service', 'paid', 'canceled')
  ),
  notes text check (notes is null or char_length(notes) <= 2000),
  creation_idempotency_key uuid not null,
  version integer not null default 1 check (version >= 1),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint appointments_clinic_id_id_key unique (clinic_id, id),
  constraint appointments_contact_fk foreign key (clinic_id, contact_id)
    references public.contacts(clinic_id, id) on delete cascade,
  constraint appointments_professional_fk foreign key (clinic_id, professional_id)
    references public.professionals(clinic_id, id) on delete restrict,
  constraint appointments_procedure_fk foreign key (clinic_id, procedure_id)
    references public.procedures(clinic_id, id) on delete restrict,
  constraint appointments_procedure_source_check check (
    (procedure_id is not null and custom_procedure_name is null)
    or (procedure_id is null and custom_procedure_name is not null)
  )
);
comment on column public.appointments.start_at is
  'Início em UTC; exibição sempre no timezone IANA da clínica (ADR-006).';
comment on column public.appointments.price_cents is
  'Preço congelado na marcação; mudanças no catálogo não reprecificam o passado.';

create unique index appointments_clinic_creation_idempotency_idx
  on public.appointments (clinic_id, creation_idempotency_key);
create index appointments_clinic_start_idx
  on public.appointments (clinic_id, start_at, professional_id);
create index appointments_clinic_professional_start_idx
  on public.appointments (clinic_id, professional_id, start_at);
create index appointments_clinic_contact_start_idx
  on public.appointments (clinic_id, contact_id, start_at);

create trigger appointments_set_updated_at before update on public.appointments
for each row execute function public.set_updated_at();

create function app_private.prevent_appointment_overlap()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
#variable_conflict use_variable
begin
  if new.status = 'canceled' then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.clinic_id::text || ':apt:' || new.professional_id::text, 0)
  );
  if exists (
    select 1
    from public.appointments as appointment
    where appointment.clinic_id = new.clinic_id
      and appointment.professional_id = new.professional_id
      and appointment.id <> new.id
      and appointment.status <> 'canceled'
      and appointment.start_at
        < new.start_at + make_interval(mins => new.duration_minutes)
      and new.start_at
        < appointment.start_at + make_interval(mins => appointment.duration_minutes)
  ) then
    raise exception using errcode = 'P4313', message = 'appointment overlap';
  end if;
  return new;
end;
$$;
alter function app_private.prevent_appointment_overlap() owner to postgres;
revoke all on function app_private.prevent_appointment_overlap()
from public, anon, authenticated;

create trigger appointments_prevent_overlap
before insert or update on public.appointments
for each row execute function app_private.prevent_appointment_overlap();

alter table public.appointments enable row level security;
alter table public.appointments force row level security;

revoke all on table public.appointments from public, anon, authenticated;

create policy appointments_select on public.appointments for select to authenticated
using (public.current_user_has_permission(clinic_id, 'appointment.view'));

grant select on table public.appointments to authenticated;

-- Leitura de agenda: intervalo temporal obrigatório e limitado, com os nomes
-- de exibição resolvidos no banco. `security invoker`: o RLS das tabelas
-- envolvidas continua sendo o controle de leitura. O nome do contato usa
-- subselect (não join) para que um papel sem `contact.view` ainda enxergue a
-- agenda, apenas sem o nome.
create function public.search_appointments(
  p_clinic_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_professional_id uuid,
  p_contact_id uuid,
  p_status text,
  p_page integer,
  p_page_size integer
)
returns table (
  id uuid,
  contact_id uuid,
  contact_name text,
  professional_id uuid,
  professional_name text,
  professional_color text,
  procedure_id uuid,
  procedure_name text,
  start_at timestamptz,
  duration_minutes integer,
  price_cents bigint,
  status text,
  notes text,
  version integer,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select appointment.id, appointment.contact_id,
    (
      select contact.full_name from public.contacts as contact
      where contact.clinic_id = appointment.clinic_id
        and contact.id = appointment.contact_id
    ),
    appointment.professional_id, professional.display_name, professional.color,
    appointment.procedure_id,
    coalesce(procedure.name, appointment.custom_procedure_name),
    appointment.start_at, appointment.duration_minutes, appointment.price_cents,
    appointment.status, appointment.notes, appointment.version,
    count(*) over()
  from public.appointments as appointment
  join public.professionals as professional
    on professional.clinic_id = appointment.clinic_id
    and professional.id = appointment.professional_id
  left join public.procedures as procedure
    on procedure.clinic_id = appointment.clinic_id
    and procedure.id = appointment.procedure_id
  where appointment.clinic_id = p_clinic_id
    and p_from is not null and p_to is not null
    and p_to > p_from and p_to <= p_from + interval '62 days'
    and appointment.start_at >= p_from and appointment.start_at < p_to
    and (p_professional_id is null or appointment.professional_id = p_professional_id)
    and (p_contact_id is null or appointment.contact_id = p_contact_id)
    and (p_status is null or appointment.status = p_status)
  order by appointment.start_at, professional.display_name, appointment.id
  limit case when p_page_size between 1 and 500 then p_page_size else 0 end
  offset case when p_page >= 1 and p_page_size between 1 and 500
    then (p_page - 1)::bigint * p_page_size else 0 end;
$$;
alter function public.search_appointments(
  uuid, timestamptz, timestamptz, uuid, uuid, text, integer, integer
) owner to postgres;
revoke all on function public.search_appointments(
  uuid, timestamptz, timestamptz, uuid, uuid, text, integer, integer
) from public, anon;
grant execute on function public.search_appointments(
  uuid, timestamptz, timestamptz, uuid, uuid, text, integer, integer
) to authenticated;
