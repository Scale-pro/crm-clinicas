-- Onda 1 — núcleo provider-neutral de conversas e mensagens WhatsApp.

create table public.whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{1,39}$'),
  external_account_id text not null check (char_length(external_account_id) between 1 and 200),
  account_key text generated always as (provider || ':' || external_account_id) stored,
  display_phone_e164 text check (display_phone_e164 is null or display_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null default 'active' check (status in ('active', 'disabled')),
  configured_by uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint whatsapp_accounts_clinic_id_key unique (clinic_id, id),
  constraint whatsapp_accounts_account_key unique (account_key),
  constraint whatsapp_accounts_configured_by_fkey
    foreign key (clinic_id, configured_by)
    references public.clinic_members(clinic_id, user_id)
    on update cascade on delete restrict
);

create table public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  whatsapp_account_id uuid not null,
  provider text not null,
  external_event_id text not null check (char_length(external_event_id) between 1 and 240),
  event_key text generated always as (whatsapp_account_id::text || ':' || external_event_id) stored,
  event_type text not null check (char_length(event_type) between 1 and 120),
  raw_payload jsonb not null check (jsonb_typeof(raw_payload) = 'object'),
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'processed', 'failed', 'dead')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  queued_at timestamptz,
  processed_at timestamptz,
  next_retry_at timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint whatsapp_webhook_events_clinic_id_key unique (clinic_id, id),
  constraint whatsapp_webhook_events_event_key unique (event_key),
  constraint whatsapp_webhook_events_account_fkey
    foreign key (clinic_id, whatsapp_account_id)
    references public.whatsapp_accounts(clinic_id, id)
    on update cascade on delete restrict
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  whatsapp_account_id uuid not null,
  contact_id uuid not null,
  opportunity_id uuid,
  assigned_to_user_id uuid,
  state text not null default 'open' check (state in ('open', 'closed')),
  needs_reply_from text not null default 'clinic' check (needs_reply_from in ('clinic', 'contact')),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_id uuid,
  last_message_at timestamptz,
  last_read_at timestamptz,
  closed_at timestamptz,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint conversations_clinic_id_key unique (clinic_id, id),
  constraint conversations_account_fkey
    foreign key (clinic_id, whatsapp_account_id)
    references public.whatsapp_accounts(clinic_id, id)
    on update cascade on delete restrict,
  constraint conversations_contact_fkey
    foreign key (clinic_id, contact_id)
    references public.contacts(clinic_id, id)
    on update cascade on delete restrict,
  constraint conversations_opportunity_fkey
    foreign key (clinic_id, opportunity_id)
    references public.opportunities(clinic_id, id)
    on update cascade on delete set null (opportunity_id),
  constraint conversations_assignee_fkey
    foreign key (clinic_id, assigned_to_user_id)
    references public.clinic_members(clinic_id, user_id)
    on update cascade on delete set null (assigned_to_user_id),
  constraint conversations_state_closed_check
    check ((state = 'closed') = (closed_at is not null)),
  constraint conversations_account_contact_key unique (clinic_id, whatsapp_account_id, contact_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  conversation_id uuid not null,
  whatsapp_account_id uuid not null,
  contact_id uuid not null,
  opportunity_id uuid,
  webhook_event_id uuid,
  direction text not null check (direction in ('inbound', 'outbound')),
  external_message_id text check (external_message_id is null or char_length(external_message_id) between 1 and 240),
  external_message_key text generated always as (
    case when external_message_id is null then null
      else whatsapp_account_id::text || ':' || external_message_id end
  ) stored,
  idempotency_key uuid,
  message_type text not null
    check (message_type in ('text', 'audio', 'image', 'video', 'document', 'location', 'contact', 'unknown')),
  text_content text check (text_content is null or char_length(text_content) <= 65535),
  attachment_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attachment_metadata) = 'object'),
  provider_payload_type text check (provider_payload_type is null or char_length(provider_payload_type) <= 120),
  occurred_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint messages_clinic_id_key unique (clinic_id, id),
  constraint messages_external_message_key unique (external_message_key),
  constraint messages_conversation_fkey
    foreign key (clinic_id, conversation_id)
    references public.conversations(clinic_id, id)
    on update cascade on delete restrict,
  constraint messages_account_fkey
    foreign key (clinic_id, whatsapp_account_id)
    references public.whatsapp_accounts(clinic_id, id)
    on update cascade on delete restrict,
  constraint messages_contact_fkey
    foreign key (clinic_id, contact_id)
    references public.contacts(clinic_id, id)
    on update cascade on delete restrict,
  constraint messages_opportunity_fkey
    foreign key (clinic_id, opportunity_id)
    references public.opportunities(clinic_id, id)
    on update cascade on delete set null (opportunity_id),
  constraint messages_webhook_event_fkey
    foreign key (clinic_id, webhook_event_id)
    references public.whatsapp_webhook_events(clinic_id, id)
    on update cascade on delete restrict
);

alter table public.conversations
  add constraint conversations_last_message_fkey
  foreign key (clinic_id, last_message_id)
  references public.messages(clinic_id, id)
  on update cascade on delete set null (last_message_id);

create table public.message_status_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  message_id uuid not null,
  webhook_event_id uuid,
  status text not null check (status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  applied boolean not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint message_status_events_clinic_id_key unique (clinic_id, id),
  constraint message_status_events_message_fkey
    foreign key (clinic_id, message_id)
    references public.messages(clinic_id, id)
    on update cascade on delete restrict,
  constraint message_status_events_webhook_fkey
    foreign key (clinic_id, webhook_event_id)
    references public.whatsapp_webhook_events(clinic_id, id)
    on update cascade on delete restrict,
  constraint message_status_events_dedupe_key
    unique (clinic_id, message_id, status, webhook_event_id)
);

create table public.conversation_assignments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  conversation_id uuid not null,
  from_user_id uuid,
  to_user_id uuid,
  assigned_by uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint conversation_assignments_clinic_id_key unique (clinic_id, id),
  constraint conversation_assignments_conversation_fkey
    foreign key (clinic_id, conversation_id)
    references public.conversations(clinic_id, id)
    on update cascade on delete restrict,
  constraint conversation_assignments_from_fkey
    foreign key (clinic_id, from_user_id)
    references public.clinic_members(clinic_id, user_id)
    on update cascade on delete set null (from_user_id),
  constraint conversation_assignments_to_fkey
    foreign key (clinic_id, to_user_id)
    references public.clinic_members(clinic_id, user_id)
    on update cascade on delete set null (to_user_id),
  constraint conversation_assignments_actor_fkey
    foreign key (clinic_id, assigned_by)
    references public.clinic_members(clinic_id, user_id)
    on update cascade on delete restrict
);

create table public.message_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  message_id uuid not null,
  attempt_number integer not null check (attempt_number >= 1),
  status text not null check (status in ('pending', 'sent', 'failed')),
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  attempted_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint message_delivery_attempts_clinic_id_key unique (clinic_id, id),
  constraint message_delivery_attempts_message_fkey
    foreign key (clinic_id, message_id)
    references public.messages(clinic_id, id)
    on update cascade on delete restrict,
  constraint message_delivery_attempts_number_key unique (clinic_id, message_id, attempt_number)
);

create unique index messages_clinic_idempotency_key
  on public.messages(clinic_id, idempotency_key)
  where idempotency_key is not null;
create index whatsapp_accounts_clinic_status_idx
  on public.whatsapp_accounts(clinic_id, status, id);
create index whatsapp_webhook_events_clinic_status_retry_idx
  on public.whatsapp_webhook_events(clinic_id, processing_status, next_retry_at, created_at);
create index conversations_clinic_state_last_idx
  on public.conversations(clinic_id, state, last_message_at desc, id);
create index conversations_clinic_assignee_state_idx
  on public.conversations(clinic_id, assigned_to_user_id, state, last_message_at desc);
create index conversations_clinic_unread_idx
  on public.conversations(clinic_id, unread_count, last_message_at desc);
create index messages_clinic_conversation_occurred_idx
  on public.messages(clinic_id, conversation_id, occurred_at desc, id desc);
create index messages_clinic_contact_occurred_idx
  on public.messages(clinic_id, contact_id, occurred_at desc);
create index message_status_events_clinic_message_occurred_idx
  on public.message_status_events(clinic_id, message_id, occurred_at, id);
create index conversation_assignments_clinic_conversation_created_idx
  on public.conversation_assignments(clinic_id, conversation_id, created_at desc);
create index message_delivery_attempts_clinic_message_attempt_idx
  on public.message_delivery_attempts(clinic_id, message_id, attempt_number desc);

create trigger whatsapp_accounts_set_updated_at before update on public.whatsapp_accounts
for each row execute function public.set_updated_at();
create trigger whatsapp_webhook_events_set_updated_at before update on public.whatsapp_webhook_events
for each row execute function public.set_updated_at();
create trigger conversations_set_updated_at before update on public.conversations
for each row execute function public.set_updated_at();

alter table public.whatsapp_accounts enable row level security;
alter table public.whatsapp_accounts force row level security;
alter table public.whatsapp_webhook_events enable row level security;
alter table public.whatsapp_webhook_events force row level security;
alter table public.conversations enable row level security;
alter table public.conversations force row level security;
alter table public.messages enable row level security;
alter table public.messages force row level security;
alter table public.message_status_events enable row level security;
alter table public.message_status_events force row level security;
alter table public.conversation_assignments enable row level security;
alter table public.conversation_assignments force row level security;
alter table public.message_delivery_attempts enable row level security;
alter table public.message_delivery_attempts force row level security;

revoke all on table public.whatsapp_accounts, public.whatsapp_webhook_events,
  public.conversations, public.messages, public.message_status_events,
  public.conversation_assignments, public.message_delivery_attempts
from public, anon, authenticated;

create policy whatsapp_accounts_select on public.whatsapp_accounts
for select to authenticated using (
  clinic_id in (select public.current_user_clinic_ids())
  and (public.current_user_has_permission(clinic_id, 'conversation.view_all')
    or public.current_user_has_permission(clinic_id, 'conversation.view_own'))
);

create policy conversations_select on public.conversations
for select to authenticated using (
  clinic_id in (select public.current_user_clinic_ids())
  and (public.current_user_has_permission(clinic_id, 'conversation.view_all')
    or (assigned_to_user_id = (select auth.uid())
      and public.current_user_has_permission(clinic_id, 'conversation.view_own')))
);

create policy messages_select on public.messages
for select to authenticated using (
  exists (select 1 from public.conversations visible
    where visible.clinic_id = messages.clinic_id and visible.id = messages.conversation_id)
);
create policy message_status_events_select on public.message_status_events
for select to authenticated using (
  exists (select 1 from public.messages visible
    where visible.clinic_id = message_status_events.clinic_id
      and visible.id = message_status_events.message_id)
);
create policy conversation_assignments_select on public.conversation_assignments
for select to authenticated using (
  exists (select 1 from public.conversations visible
    where visible.clinic_id = conversation_assignments.clinic_id
      and visible.id = conversation_assignments.conversation_id)
);
create policy message_delivery_attempts_select on public.message_delivery_attempts
for select to authenticated using (
  exists (select 1 from public.messages visible
    where visible.clinic_id = message_delivery_attempts.clinic_id
      and visible.id = message_delivery_attempts.message_id)
);

grant select on table public.whatsapp_accounts, public.conversations, public.messages,
  public.message_status_events, public.conversation_assignments,
  public.message_delivery_attempts to authenticated;

drop policy contacts_select on public.contacts;
create policy contacts_select on public.contacts
for select to authenticated using (
  clinic_id in (select public.current_user_clinic_ids())
  and (
    public.current_user_has_permission(clinic_id, 'contact.view_all')
    or (owner_user_id = (select auth.uid())
      and public.current_user_has_permission(clinic_id, 'contact.view_own'))
    or exists (
      select 1 from public.conversations visible_conversation
      where visible_conversation.clinic_id = contacts.clinic_id
        and visible_conversation.contact_id = contacts.id
    )
  )
);

insert into public.permissions(key) values
  ('conversation.view_own'),
  ('conversation.view_all'),
  ('conversation.assign'),
  ('conversation.manage'),
  ('conversation.send');

insert into public.role_permissions(role, permission) values
  ('owner', 'conversation.view_own'), ('owner', 'conversation.view_all'),
  ('owner', 'conversation.assign'), ('owner', 'conversation.manage'), ('owner', 'conversation.send'),
  ('admin', 'conversation.view_own'), ('admin', 'conversation.view_all'),
  ('admin', 'conversation.assign'), ('admin', 'conversation.manage'), ('admin', 'conversation.send'),
  ('manager', 'conversation.view_own'), ('manager', 'conversation.view_all'),
  ('manager', 'conversation.assign'), ('manager', 'conversation.manage'), ('manager', 'conversation.send'),
  ('sdr', 'conversation.view_own'), ('sdr', 'conversation.send'),
  ('receptionist', 'conversation.view_own'), ('receptionist', 'conversation.view_all'),
  ('receptionist', 'conversation.send'),
  ('professional', 'conversation.view_own'),
  ('viewer', 'conversation.view_all');
