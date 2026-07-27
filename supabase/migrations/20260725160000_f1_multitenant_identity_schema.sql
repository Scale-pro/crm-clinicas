-- F1.2 — identidade multi-tenant. Somente dados estruturais fictícios/catálogos.

create type public.support_access_level as enum (
  'read_only',
  'support_operations',
  'restricted_write'
);

create function public.is_valid_iana_timezone(value text)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from pg_catalog.pg_timezone_names
    where name = value
  );
$$;
alter function public.is_valid_iana_timezone(text) owner to postgres;
revoke all on function public.is_valid_iana_timezone(text) from public, anon, authenticated;

create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;
alter function public.set_updated_at() owner to postgres;
revoke all on function public.set_updated_at() from public, anon, authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (full_name is null or char_length(trim(full_name)) between 1 and 160),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table public.roles (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$')
);

create table public.permissions (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$')
);

create table public.role_permissions (
  role text not null references public.roles(key) on update cascade on delete restrict,
  permission text not null references public.permissions(key) on update cascade on delete restrict,
  primary key (role, permission)
);

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  slug text not null unique check (
    slug = lower(slug)
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 3 and 80
  ),
  timezone text not null check (public.is_valid_iana_timezone(timezone)),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz,
  constraint clinics_deleted_status_check check (
    deleted_at is null or status = 'suspended'
  )
);

create table public.clinic_members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null references public.roles(key) on update cascade on delete restrict,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint clinic_members_clinic_user_key unique (clinic_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  email text not null check (
    email = lower(trim(email))
    and char_length(email) between 3 and 320
    and email like '%@%'
  ),
  role text not null references public.roles(key) on update cascade on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint invitations_expiry_check check (expires_at > created_at)
);

create table public.clinic_features (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  feature_key text not null check (feature_key ~ '^[a-z][a-z0-9_]*$'),
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  primary key (clinic_id, feature_key)
);

create table public.clinic_limits (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  limit_key text not null check (limit_key ~ '^[a-z][a-z0-9_]*$'),
  limit_value bigint not null check (limit_value >= 0),
  primary key (clinic_id, limit_key)
);

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default statement_timestamp(),
  created_by uuid references auth.users(id) on delete set null
);

create table public.support_grants (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  access_level public.support_access_level not null default 'read_only',
  reason text not null check (char_length(trim(reason)) between 10 and 1000),
  write_justification text check (
    write_justification is null
    or char_length(trim(write_justification)) between 10 and 2000
  ),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  constraint support_grants_expiry_check check (expires_at > created_at),
  constraint support_grants_revocation_check check (
    (revoked_at is null and revoked_by is null)
    or (revoked_at is not null and revoked_by is not null)
  )
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null check (type ~ '^[a-z][a-z0-9_.-]*$'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default statement_timestamp()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  support_grant_id uuid references public.support_grants(id) on delete restrict,
  action text not null check (action ~ '^[a-z][a-z0-9_.-]*$'),
  entity text not null check (entity ~ '^[a-z][a-z0-9_]*$'),
  entity_id uuid,
  access_level public.support_access_level,
  reason text check (reason is null or char_length(trim(reason)) between 1 and 1000),
  before jsonb,
  after jsonb,
  via text not null check (via in ('user', 'support', 'system')),
  occurred_at timestamptz not null default statement_timestamp(),
  constraint audit_logs_support_context_check check (
    (via = 'support' and support_grant_id is not null and access_level is not null)
    or (via <> 'support' and support_grant_id is null)
  )
);

-- Índices tenant-first para os caminhos escopados por clínica.
create index clinic_members_clinic_user_idx
  on public.clinic_members (clinic_id, user_id);
create index invitations_clinic_status_idx
  on public.invitations (clinic_id, status);
create index support_grants_clinic_expiry_idx
  on public.support_grants (clinic_id, expires_at)
  where revoked_at is null;
create index activities_clinic_occurred_idx
  on public.activities (clinic_id, occurred_at desc);
create index audit_logs_clinic_occurred_idx
  on public.audit_logs (clinic_id, occurred_at desc);

-- Suplementar: descoberta das clínicas de um usuário antes de haver tenant ativo.
create index clinic_members_user_status_idx
  on public.clinic_members (user_id, status);
comment on index public.clinic_members_user_status_idx is
  'Suplementar: resolve memberships do usuário antes da seleção de tenant.';

-- Suplementar: painel do administrador consulta seus grants ativos.
create index support_grants_admin_expiry_idx
  on public.support_grants (admin_user_id, expires_at);
comment on index public.support_grants_admin_expiry_idx is
  'Suplementar: lista grants do platform admin independentemente do tenant.';

-- Suplementares: investigação de auditoria por ator ou grant específico.
create index audit_logs_actor_occurred_idx
  on public.audit_logs (actor_id, occurred_at desc);
comment on index public.audit_logs_actor_occurred_idx is
  'Suplementar: investigação de eventos por ator.';
create index audit_logs_support_grant_idx
  on public.audit_logs (support_grant_id)
  where support_grant_id is not null;
comment on index public.audit_logs_support_grant_idx is
  'Suplementar: histórico completo de um support grant.';

create unique index invitations_one_pending_per_email_idx
  on public.invitations (clinic_id, lower(email))
  where status = 'pending';

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();
create trigger clinics_set_updated_at
before update on public.clinics
for each row execute function public.set_updated_at();
create trigger clinic_members_set_updated_at
before update on public.clinic_members
for each row execute function public.set_updated_at();
create trigger invitations_set_updated_at
before update on public.invitations
for each row execute function public.set_updated_at();

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name, avatar_url)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;
alter function public.handle_new_auth_user() owner to postgres;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

insert into public.roles (key) values
  ('owner'),
  ('admin'),
  ('manager'),
  ('sdr'),
  ('receptionist'),
  ('professional'),
  ('viewer');

insert into public.permissions (key) values
  ('clinic.manage'),
  ('member.invite'),
  ('member.manage'),
  ('member.remove'),
  ('audit.view');

insert into public.role_permissions (role, permission) values
  ('owner', 'clinic.manage'),
  ('owner', 'member.invite'),
  ('owner', 'member.manage'),
  ('owner', 'member.remove'),
  ('owner', 'audit.view'),
  ('admin', 'clinic.manage'),
  ('admin', 'member.invite'),
  ('admin', 'member.manage'),
  ('admin', 'audit.view'),
  ('manager', 'member.invite');

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.clinics enable row level security;
alter table public.clinics force row level security;
alter table public.clinic_members enable row level security;
alter table public.clinic_members force row level security;
alter table public.roles enable row level security;
alter table public.roles force row level security;
alter table public.permissions enable row level security;
alter table public.permissions force row level security;
alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;
alter table public.invitations enable row level security;
alter table public.invitations force row level security;
alter table public.clinic_features enable row level security;
alter table public.clinic_features force row level security;
alter table public.clinic_limits enable row level security;
alter table public.clinic_limits force row level security;
alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;
alter table public.support_grants enable row level security;
alter table public.support_grants force row level security;
alter table public.activities enable row level security;
alter table public.activities force row level security;
alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;

revoke all on table
  public.profiles,
  public.clinics,
  public.clinic_members,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.invitations,
  public.clinic_features,
  public.clinic_limits,
  public.platform_admins,
  public.support_grants,
  public.activities,
  public.audit_logs
from public, anon, authenticated;
