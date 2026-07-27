-- F2.1 — pessoas e contatos: schema, invariantes, índices e RLS de leitura.

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  owner_user_id uuid,
  notes text check (notes is null or char_length(notes) <= 2000),
  archived_at timestamptz,
  idempotency_key uuid,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  constraint contacts_clinic_id_key unique (clinic_id, id),
  constraint contacts_owner_member_fkey
    foreign key (clinic_id, owner_user_id)
    references public.clinic_members (clinic_id, user_id)
    on update cascade
    on delete set null (owner_user_id)
);

create table public.person_contacts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  contact_id uuid not null,
  kind text not null check (kind in ('phone', 'email')),
  raw_value text not null check (char_length(raw_value) between 3 and 320),
  normalized_value text not null check (char_length(normalized_value) between 3 and 320),
  label text check (label is null or char_length(trim(label)) between 1 and 40),
  is_primary boolean not null default false,
  is_whatsapp boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint person_contacts_contact_fkey
    foreign key (clinic_id, contact_id)
    references public.contacts (clinic_id, id)
    on update cascade
    on delete restrict,
  constraint person_contacts_whatsapp_kind_check
    check (kind = 'phone' or is_whatsapp = false),
  constraint person_contacts_phone_e164_check
    check (kind <> 'phone' or normalized_value ~ '^\+[1-9][0-9]{7,14}$'),
  constraint person_contacts_email_normalized_check
    check (kind <> 'email' or normalized_value = lower(trim(normalized_value))),
  constraint person_contacts_email_shape_check
    check (kind <> 'email' or normalized_value ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

create table public.patients (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  contact_id uuid not null,
  became_patient_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (clinic_id, contact_id),
  constraint patients_contact_fkey
    foreign key (clinic_id, contact_id)
    references public.contacts (clinic_id, id)
    on update cascade
    on delete restrict
);

create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  archived_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint lead_sources_clinic_id_key unique (clinic_id, id)
);

alter table public.activities add column contact_id uuid;
alter table public.activities
  add constraint activities_contact_fkey
  foreign key (clinic_id, contact_id)
  references public.contacts (clinic_id, id)
  on update cascade
  on delete restrict;

create unique index contacts_clinic_idempotency_key
  on public.contacts (clinic_id, idempotency_key)
  where idempotency_key is not null;
create index contacts_clinic_created_idx
  on public.contacts (clinic_id, created_at desc);
create index contacts_clinic_owner_active_idx
  on public.contacts (clinic_id, owner_user_id)
  where archived_at is null;
create index contacts_clinic_name_idx
  on public.contacts (clinic_id, lower(full_name));

create unique index person_contacts_active_value_key
  on public.person_contacts (clinic_id, kind, normalized_value)
  where archived_at is null;
create unique index person_contacts_primary_kind_key
  on public.person_contacts (contact_id, kind)
  where is_primary = true and archived_at is null;
comment on index public.person_contacts_primary_kind_key is
  'A ordem contact_id/kind satisfaz a unicidade por pessoa; o índice operacional tenant-first separado preserva o padrão multi-tenant.';
create index person_contacts_clinic_value_idx
  on public.person_contacts (clinic_id, normalized_value);
create index person_contacts_clinic_contact_kind_idx
  on public.person_contacts (clinic_id, contact_id, kind);

create index patients_clinic_became_idx
  on public.patients (clinic_id, became_patient_at desc);
create index lead_sources_clinic_name_idx
  on public.lead_sources (clinic_id, name);
create unique index lead_sources_active_normalized_name_key
  on public.lead_sources (clinic_id, lower(trim(name)))
  where archived_at is null;
create index activities_clinic_contact_occurred_idx
  on public.activities (clinic_id, contact_id, occurred_at desc)
  where contact_id is not null;

create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();
create trigger person_contacts_set_updated_at
before update on public.person_contacts
for each row execute function public.set_updated_at();
create trigger patients_set_updated_at
before update on public.patients
for each row execute function public.set_updated_at();
create trigger lead_sources_set_updated_at
before update on public.lead_sources
for each row execute function public.set_updated_at();

alter table public.contacts enable row level security;
alter table public.contacts force row level security;
alter table public.person_contacts enable row level security;
alter table public.person_contacts force row level security;
alter table public.patients enable row level security;
alter table public.patients force row level security;
alter table public.lead_sources enable row level security;
alter table public.lead_sources force row level security;

revoke all on table
  public.contacts,
  public.person_contacts,
  public.patients,
  public.lead_sources
from public, anon, authenticated;

create policy contacts_select
on public.contacts
for select
to authenticated
using (
  clinic_id in (select public.current_user_clinic_ids())
  and (
    public.current_user_has_permission(clinic_id, 'contact.view_all')
    or (
      owner_user_id = (select auth.uid())
      and public.current_user_has_permission(clinic_id, 'contact.view_own')
    )
  )
);

create policy person_contacts_select
on public.person_contacts
for select
to authenticated
using (
  exists (
    select 1
    from public.contacts as visible_contact
    where visible_contact.clinic_id = person_contacts.clinic_id
      and visible_contact.id = person_contacts.contact_id
  )
);

create policy patients_select
on public.patients
for select
to authenticated
using (
  exists (
    select 1
    from public.contacts as visible_contact
    where visible_contact.clinic_id = patients.clinic_id
      and visible_contact.id = patients.contact_id
  )
);

create policy lead_sources_select
on public.lead_sources
for select
to authenticated
using (
  clinic_id in (select public.current_user_clinic_ids())
  and (
    public.current_user_has_permission(clinic_id, 'contact.view_all')
    or public.current_user_has_permission(clinic_id, 'contact.view_own')
    or public.current_user_has_permission(clinic_id, 'lead_source.manage')
  )
);

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
      select 1
      from public.contacts as visible_contact
      where visible_contact.clinic_id = activities.clinic_id
        and visible_contact.id = activities.contact_id
    )
  )
);

grant select on table
  public.contacts,
  public.person_contacts,
  public.patients,
  public.lead_sources
to authenticated;

create function app_private.log_activity(
  p_clinic_id uuid,
  p_type text,
  p_payload jsonb,
  p_contact_id uuid
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
    or p_type !~ '^[a-z][a-z0-9_.-]*$'
    or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
  then
    raise exception using errcode = '22023', message = 'invalid activity';
  end if;

  insert into public.activities (clinic_id, actor_id, type, payload, contact_id)
  values (
    p_clinic_id,
    (select auth.uid()),
    p_type,
    coalesce(p_payload, '{}'::jsonb),
    p_contact_id
  )
  returning id into v_id;
  return v_id;
end;
$$;
alter function app_private.log_activity(uuid, text, jsonb, uuid) owner to postgres;
revoke all on function app_private.log_activity(uuid, text, jsonb, uuid)
from public, anon, authenticated;
