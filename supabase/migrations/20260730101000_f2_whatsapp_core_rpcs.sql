-- Onda 1 — processamento atômico, idempotência e mutações autorizadas.

create function app_private.normalize_whatsapp_phone(p_raw_value text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare v_digits text; v_normalized text;
begin
  if p_raw_value is null or p_raw_value ~ '[^0-9[:space:]()+.\-]' then
    raise exception using errcode = '22023', message = 'invalid whatsapp phone';
  end if;
  v_digits := pg_catalog.regexp_replace(p_raw_value, '[^0-9]', '', 'g');
  if trim(p_raw_value) like '+%' then
    v_normalized := '+' || v_digits;
  elsif char_length(v_digits) in (10, 11) then
    v_normalized := '+55' || v_digits;
  elsif char_length(v_digits) in (12, 13) and v_digits like '55%' then
    v_normalized := '+' || v_digits;
  else
    raise exception using errcode = '22023', message = 'invalid whatsapp phone';
  end if;
  if v_normalized !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception using errcode = '22023', message = 'invalid whatsapp phone';
  end if;
  return v_normalized;
end;
$$;
alter function app_private.normalize_whatsapp_phone(text) owner to postgres;
revoke all on function app_private.normalize_whatsapp_phone(text)
from public, anon, authenticated, service_role;

create function app_private.resolve_whatsapp_lead(
  p_clinic_id uuid,
  p_phone_e164 text,
  p_contact_name text,
  p_actor_id uuid,
  p_idempotency_key uuid
)
returns table(contact_id uuid, opportunity_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_contact_id uuid;
  v_opportunity_id uuid;
  v_pipeline_id uuid;
  v_stage_id uuid;
  v_board_position numeric;
begin
  if p_clinic_id is null or p_actor_id is null or p_idempotency_key is null
    or p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$'
    or p_contact_name is null or char_length(trim(p_contact_name)) not between 2 and 160
  then
    raise exception using errcode = '22023', message = 'invalid whatsapp lead';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_clinic_id::text || ':' || p_phone_e164, 73)
  );

  select c.id into v_contact_id
  from public.person_contacts pc
  join public.contacts c
    on c.clinic_id = pc.clinic_id and c.id = pc.contact_id
  where pc.clinic_id = p_clinic_id
    and pc.kind = 'phone'
    and pc.normalized_value = p_phone_e164
    and pc.archived_at is null
    and c.archived_at is null
  order by c.created_at, c.id
  limit 1;

  if v_contact_id is null then
    insert into public.contacts(
      clinic_id, full_name, owner_user_id, idempotency_key,
      created_by, updated_by
    ) values (
      p_clinic_id, trim(p_contact_name), null, p_idempotency_key,
      p_actor_id, p_actor_id
    )
    returning id into v_contact_id;

    insert into public.person_contacts(
      clinic_id, contact_id, kind, raw_value, normalized_value,
      label, is_primary, is_whatsapp
    ) values (
      p_clinic_id, v_contact_id, 'phone', p_phone_e164, p_phone_e164,
      'WhatsApp', true, true
    );
  end if;

  select p.id into v_pipeline_id
  from public.pipelines p
  where p.clinic_id = p_clinic_id and p.is_default and p.archived_at is null
  for share;
  if v_pipeline_id is null then
    raise exception using errcode = 'P0002', message = 'default pipeline not found';
  end if;

  select o.id into v_opportunity_id
  from public.opportunities o
  where o.clinic_id = p_clinic_id
    and o.contact_id = v_contact_id
    and o.pipeline_id = v_pipeline_id
    and o.status = 'open'
  order by o.created_at, o.id
  limit 1
  for update;

  if v_opportunity_id is null then
    select ps.id into v_stage_id
    from public.pipeline_stages ps
    where ps.clinic_id = p_clinic_id
      and ps.pipeline_id = v_pipeline_id
      and ps.stage_kind = 'open'
    order by ps.position, ps.id
    limit 1;
    if v_stage_id is null then
      raise exception using errcode = 'P4091', message = 'pipeline structure conflict';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_clinic_id::text || ':' || v_stage_id::text, 74)
    );
    select coalesce(max(o.board_position), 0) + 1000 into v_board_position
    from public.opportunities o
    where o.clinic_id = p_clinic_id and o.stage_id = v_stage_id and o.status = 'open';

    insert into public.opportunities(
      clinic_id, contact_id, pipeline_id, stage_id, status,
      assigned_to_user_id, title, board_position, idempotency_key
    ) values (
      p_clinic_id, v_contact_id, v_pipeline_id, v_stage_id, 'open',
      null, 'Atendimento via WhatsApp', v_board_position, p_idempotency_key
    )
    on conflict (clinic_id, idempotency_key) where idempotency_key is not null
    do update set idempotency_key = excluded.idempotency_key
    returning id into v_opportunity_id;

    insert into public.opportunity_stage_events(
      clinic_id, opportunity_id, from_stage_id, to_stage_id,
      from_status, to_status, actor_id
    ) values (
      p_clinic_id, v_opportunity_id, null, v_stage_id,
      null, 'open', p_actor_id
    ) on conflict do nothing;

    insert into public.activities(
      clinic_id, actor_id, type, payload, contact_id, opportunity_id
    ) values (
      p_clinic_id, p_actor_id, 'lead_in_whatsapp', '{}'::jsonb,
      v_contact_id, v_opportunity_id
    );
  end if;

  return query select v_contact_id, v_opportunity_id;
end;
$$;
alter function app_private.resolve_whatsapp_lead(uuid, text, text, uuid, uuid) owner to postgres;
revoke all on function app_private.resolve_whatsapp_lead(uuid, text, text, uuid, uuid)
from public, anon, authenticated, service_role;

create function public.ingest_whatsapp_event(
  p_provider text,
  p_account_external_id text,
  p_external_event_id text,
  p_event_type text,
  p_raw_payload jsonb
)
returns table(event_id uuid, duplicate boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_account public.whatsapp_accounts;
  v_event_id uuid;
begin
  if p_provider !~ '^[a-z][a-z0-9_-]{1,39}$'
    or p_account_external_id is null or char_length(p_account_external_id) not between 1 and 200
    or p_external_event_id is null or char_length(p_external_event_id) not between 1 and 240
    or p_event_type is null or char_length(p_event_type) not between 1 and 120
    or jsonb_typeof(p_raw_payload) <> 'object'
  then
    raise exception using errcode = '22023', message = 'invalid whatsapp event';
  end if;

  select wa.* into v_account
  from public.whatsapp_accounts wa
  where wa.account_key = p_provider || ':' || p_account_external_id
    and wa.status = 'active';
  if not found then
    raise exception using errcode = 'P0002', message = 'whatsapp account not found';
  end if;

  insert into public.whatsapp_webhook_events(
    clinic_id, whatsapp_account_id, provider, external_event_id,
    event_type, raw_payload
  ) values (
    v_account.clinic_id, v_account.id, v_account.provider,
    p_external_event_id, p_event_type, p_raw_payload
  ) on conflict (event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select we.id into v_event_id
    from public.whatsapp_webhook_events we
    where we.event_key = v_account.id::text || ':' || p_external_event_id;
    return query select v_event_id, true;
  else
    return query select v_event_id, false;
  end if;
end;
$$;
alter function public.ingest_whatsapp_event(text, text, text, text, jsonb) owner to postgres;
revoke all on function public.ingest_whatsapp_event(text, text, text, text, jsonb)
from public, anon, authenticated;
grant execute on function public.ingest_whatsapp_event(text, text, text, text, jsonb)
to service_role;

create function public.process_whatsapp_message(
  p_event_id uuid,
  p_external_message_id text,
  p_direction text,
  p_phone text,
  p_contact_name text,
  p_message_type text,
  p_text_content text,
  p_attachment_metadata jsonb,
  p_provider_payload_type text,
  p_occurred_at timestamptz
)
returns table(
  event_id uuid,
  message_id uuid,
  contact_id uuid,
  opportunity_id uuid,
  conversation_id uuid,
  duplicate boolean,
  error_code text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_event public.whatsapp_webhook_events;
  v_account public.whatsapp_accounts;
  v_phone text;
  v_contact_id uuid;
  v_opportunity_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_initial_status text;
  v_error_code text;
begin
  select we.* into v_event
  from public.whatsapp_webhook_events we
  where we.id = p_event_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'whatsapp event not found';
  end if;

  select wa.* into v_account
  from public.whatsapp_accounts wa
  where wa.clinic_id = v_event.clinic_id and wa.id = v_event.whatsapp_account_id;

  if v_event.processing_status = 'processed' then
    select m.id, m.contact_id, m.opportunity_id, m.conversation_id
      into v_message_id, v_contact_id, v_opportunity_id, v_conversation_id
    from public.messages m
    where m.clinic_id = v_event.clinic_id and m.webhook_event_id = v_event.id
    order by m.created_at limit 1;
    return query select v_event.id, v_message_id, v_contact_id,
      v_opportunity_id, v_conversation_id, true, null::text;
    return;
  end if;

  update public.whatsapp_webhook_events we
  set processing_status = 'processing', attempt_count = attempt_count + 1,
      last_error_code = null, next_retry_at = null
  where we.id = v_event.id;

  begin
    if p_external_message_id is null or char_length(p_external_message_id) not between 1 and 240
      or p_direction not in ('inbound', 'outbound')
      or p_message_type not in ('text', 'audio', 'image', 'video', 'document', 'location', 'contact', 'unknown')
      or (p_text_content is not null and char_length(p_text_content) > 65535)
      or jsonb_typeof(coalesce(p_attachment_metadata, '{}'::jsonb)) <> 'object'
      or coalesce(p_attachment_metadata, '{}'::jsonb) - array[
        'caption', 'fileName', 'latitude', 'longitude', 'mediaId',
        'mimeType', 'sha256', 'sizeBytes'
      ] <> '{}'::jsonb
      or p_occurred_at is null
    then
      raise exception using errcode = '22023', message = 'invalid normalized message';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      v_event.whatsapp_account_id::text || ':' || p_external_message_id, 75
    ));
    v_phone := app_private.normalize_whatsapp_phone(p_phone);

    select m.id, m.contact_id, m.opportunity_id, m.conversation_id
      into v_message_id, v_contact_id, v_opportunity_id, v_conversation_id
    from public.messages m
    where m.external_message_key = v_event.whatsapp_account_id::text || ':' || p_external_message_id;
    if v_message_id is not null then
      update public.whatsapp_webhook_events we
      set processing_status = 'processed', processed_at = statement_timestamp()
      where we.id = v_event.id;
      return query select v_event.id, v_message_id, v_contact_id,
        v_opportunity_id, v_conversation_id, true, null::text;
      return;
    end if;

    select resolved.contact_id, resolved.opportunity_id
      into v_contact_id, v_opportunity_id
    from app_private.resolve_whatsapp_lead(
      v_event.clinic_id, v_phone, coalesce(nullif(trim(p_contact_name), ''), 'Contato do WhatsApp'),
      v_account.configured_by, v_event.id
    ) resolved;

    insert into public.conversations(
      clinic_id, whatsapp_account_id, contact_id, opportunity_id
    ) values (
      v_event.clinic_id, v_event.whatsapp_account_id, v_contact_id, v_opportunity_id
    )
    -- Conflito referenciado pela constraint, não pela lista de colunas: esta
    -- função declara `#variable_conflict use_variable` e tem parâmetro OUT
    -- chamado `contact_id`, então `on conflict (..., contact_id)` resolveria
    -- `contact_id` para a variável e não para a coluna — o que faz a inferência
    -- do índice falhar com 42P10.
    on conflict on constraint conversations_account_contact_key
    do update set opportunity_id = coalesce(public.conversations.opportunity_id, excluded.opportunity_id)
    returning id into v_conversation_id;

    v_initial_status := case when p_direction = 'inbound' then 'delivered' else 'pending' end;
    insert into public.messages(
      clinic_id, conversation_id, whatsapp_account_id, contact_id,
      opportunity_id, webhook_event_id, direction, external_message_id,
      message_type, text_content, attachment_metadata, provider_payload_type,
      occurred_at
    ) values (
      v_event.clinic_id, v_conversation_id, v_event.whatsapp_account_id, v_contact_id,
      v_opportunity_id, v_event.id, p_direction, p_external_message_id,
      p_message_type, p_text_content, coalesce(p_attachment_metadata, '{}'::jsonb),
      p_provider_payload_type, p_occurred_at
    ) returning id into v_message_id;

    insert into public.message_status_events(
      clinic_id, message_id, webhook_event_id, status, applied, occurred_at
    ) values (
      v_event.clinic_id, v_message_id, v_event.id, v_initial_status, true, p_occurred_at
    );

    update public.conversations c
    set last_message_id = v_message_id,
        last_message_at = p_occurred_at,
        unread_count = case when p_direction = 'inbound' then c.unread_count + 1 else c.unread_count end,
        needs_reply_from = case when p_direction = 'inbound' then 'clinic' else 'contact' end,
        version = c.version + 1
    where c.clinic_id = v_event.clinic_id and c.id = v_conversation_id;

    update public.whatsapp_webhook_events we
    set processing_status = 'processed', processed_at = statement_timestamp()
    where we.id = v_event.id;

    return query select v_event.id, v_message_id, v_contact_id,
      v_opportunity_id, v_conversation_id, false, null::text;
  exception when others then
    v_error_code := case
      when sqlstate in ('22023', '23502', '23514') then 'invalid_message'
      when sqlstate = '23503' then 'referential_conflict'
      when sqlstate = '23505' then 'idempotency_conflict'
      when sqlstate = '42501' then 'authorization_failed'
      when sqlstate = 'P0002' then 'dependency_not_found'
      when sqlstate like '42%' then 'persistence_contract_failed'
      else 'processing_failed'
    end;
    update public.whatsapp_webhook_events we
    set processing_status = 'failed', last_error_code = v_error_code,
        next_retry_at = statement_timestamp()
    where we.id = v_event.id;
    return query select v_event.id, null::uuid, null::uuid, null::uuid,
      null::uuid, false, v_error_code;
  end;
end;
$$;
alter function public.process_whatsapp_message(uuid, text, text, text, text, text, text, jsonb, text, timestamptz) owner to postgres;
revoke all on function public.process_whatsapp_message(uuid, text, text, text, text, text, text, jsonb, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.process_whatsapp_message(uuid, text, text, text, text, text, text, jsonb, text, timestamptz)
to service_role;

create function public.record_whatsapp_message_status(
  p_webhook_event_id uuid,
  p_external_message_id text,
  p_status text,
  p_occurred_at timestamptz
)
returns table(message_id uuid, applied boolean, current_status text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_event public.whatsapp_webhook_events;
  v_message public.messages;
  v_applied boolean;
  v_current_rank integer;
  v_new_rank integer;
  v_existing_applied boolean;
begin
  if p_status not in ('pending', 'sent', 'delivered', 'read', 'failed') or p_occurred_at is null then
    raise exception using errcode = '22023', message = 'invalid message status';
  end if;
  select we.* into v_event from public.whatsapp_webhook_events we
  where we.id = p_webhook_event_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'whatsapp event not found'; end if;
  select m.* into v_message from public.messages m
  where m.clinic_id = v_event.clinic_id
    and m.whatsapp_account_id = v_event.whatsapp_account_id
    and m.external_message_id = p_external_message_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'message not found'; end if;

  select mse.applied into v_existing_applied
  from public.message_status_events mse
  where mse.clinic_id = v_event.clinic_id
    and mse.message_id = v_message.id
    and mse.status = p_status
    and mse.webhook_event_id = v_event.id;
  if found then
    select mse.status into current_status
    from public.message_status_events mse
    where mse.clinic_id = v_event.clinic_id and mse.message_id = v_message.id and mse.applied
    order by case mse.status when 'read' then 3 when 'delivered' then 2
      when 'sent' then 1 when 'pending' then 0 else -1 end desc,
      mse.occurred_at desc, mse.created_at desc, mse.id desc
    limit 1;
    return query select v_message.id, v_existing_applied, current_status;
    return;
  end if;

  select case mse.status when 'pending' then 0 when 'sent' then 1
      when 'delivered' then 2 when 'read' then 3 else -1 end,
    mse.status
    into v_current_rank, current_status
  from public.message_status_events mse
  where mse.clinic_id = v_event.clinic_id and mse.message_id = v_message.id and mse.applied
  order by case mse.status when 'read' then 3 when 'delivered' then 2
    when 'sent' then 1 when 'pending' then 0 else -1 end desc,
    mse.occurred_at desc, mse.created_at desc, mse.id desc
  limit 1;
  v_current_rank := coalesce(v_current_rank, -1);
  v_new_rank := case p_status when 'pending' then 0 when 'sent' then 1
    when 'delivered' then 2 when 'read' then 3 else -1 end;
  v_applied := case when p_status = 'failed' then coalesce(current_status, '') <> 'read'
    else v_new_rank >= v_current_rank end;

  insert into public.message_status_events(
    clinic_id, message_id, webhook_event_id, status, applied, occurred_at
  ) values (
    v_event.clinic_id, v_message.id, v_event.id, p_status, v_applied, p_occurred_at
  );

  update public.whatsapp_webhook_events we
  set processing_status = 'processed', processed_at = statement_timestamp(),
      attempt_count = attempt_count + 1, last_error_code = null
  where we.id = v_event.id;
  return query select v_message.id, v_applied,
    case when v_applied then p_status else current_status end;
end;
$$;
alter function public.record_whatsapp_message_status(uuid, text, text, timestamptz) owner to postgres;
revoke all on function public.record_whatsapp_message_status(uuid, text, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.record_whatsapp_message_status(uuid, text, text, timestamptz)
to service_role;

-- `pending` também é recuperável: um evento persistido cujo enfileiramento
-- falhou fica exatamente nesse estado, sem mensagem na fila e sem ninguém para
-- reprocessá-lo. Reenfileirar é seguro porque process_whatsapp_message é
-- idempotente (serializa por mensagem externa e devolve duplicate).
create function public.retry_whatsapp_event(p_event_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.whatsapp_webhook_events we
  set processing_status = 'pending', next_retry_at = null, last_error_code = null
  where we.id = p_event_id and we.processing_status in ('pending', 'failed', 'dead');
  return found;
end;
$$;
alter function public.retry_whatsapp_event(uuid) owner to postgres;
revoke all on function public.retry_whatsapp_event(uuid) from public, anon, authenticated;
grant execute on function public.retry_whatsapp_event(uuid) to service_role;

-- `p_search_phone` chega já normalizado em E.164 pelo chamador. Esta função é
-- `security invoker` (é a RLS que filtra o tenant), e `authenticated` não tem
-- acesso ao schema app_private — normalizar aqui dentro exigiria expor o helper
-- privado. A normalização de entrada do usuário já pertence a shared/lib.
create function public.search_conversations(
  p_clinic_id uuid,
  p_search text,
  p_search_phone text,
  p_unread_only boolean,
  p_assigned_to_user_id uuid,
  p_state text,
  p_page integer,
  p_page_size integer
)
returns table(
  id uuid, contact_id uuid, contact_name text, phone_e164 text,
  opportunity_id uuid, assigned_to_user_id uuid, state text,
  needs_reply_from text, unread_count integer, last_message_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.contact_id, contact.full_name,
    phone.normalized_value, c.opportunity_id, c.assigned_to_user_id,
    c.state, c.needs_reply_from, c.unread_count, c.last_message_at
  from public.conversations c
  join public.contacts contact
    on contact.clinic_id = c.clinic_id and contact.id = c.contact_id
  left join lateral (
    select pc.normalized_value
    from public.person_contacts pc
    where pc.clinic_id = c.clinic_id and pc.contact_id = c.contact_id
      and pc.kind = 'phone' and pc.is_whatsapp and pc.archived_at is null
    order by pc.is_primary desc, pc.created_at, pc.id limit 1
  ) phone on true
  where c.clinic_id = p_clinic_id
    and (p_state is null or c.state = p_state)
    and (not coalesce(p_unread_only, false) or c.unread_count > 0)
    and (p_assigned_to_user_id is null or c.assigned_to_user_id = p_assigned_to_user_id)
    and (coalesce(trim(p_search), '') = ''
      or contact.full_name ilike '%' || replace(replace(replace(trim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
      or (p_search_phone is not null and phone.normalized_value = p_search_phone))
  order by c.last_message_at desc nulls last, c.id
  offset (p_page - 1) * p_page_size
  limit p_page_size + 1
$$;
alter function public.search_conversations(uuid, text, text, boolean, uuid, text, integer, integer) owner to postgres;
revoke all on function public.search_conversations(uuid, text, text, boolean, uuid, text, integer, integer)
from public, anon, authenticated;
grant execute on function public.search_conversations(uuid, text, text, boolean, uuid, text, integer, integer)
to authenticated;

create function public.list_conversation_messages(
  p_clinic_id uuid,
  p_conversation_id uuid,
  p_before_occurred_at timestamptz,
  p_page_size integer
)
returns table(
  id uuid, direction text, message_type text, text_content text,
  attachment_metadata jsonb, delivery_status text,
  occurred_at timestamptz, created_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select m.id, m.direction, m.message_type, m.text_content,
    m.attachment_metadata, status.status, m.occurred_at, m.created_at
  from public.messages m
  left join lateral (
    select mse.status
    from public.message_status_events mse
    where mse.clinic_id = m.clinic_id and mse.message_id = m.id and mse.applied
    order by case mse.status when 'read' then 3 when 'delivered' then 2
      when 'sent' then 1 when 'pending' then 0 else -1 end desc,
      mse.occurred_at desc, mse.created_at desc, mse.id desc limit 1
  ) status on true
  where m.clinic_id = p_clinic_id and m.conversation_id = p_conversation_id
    and (p_before_occurred_at is null or m.occurred_at < p_before_occurred_at)
  order by m.occurred_at desc, m.id desc
  limit p_page_size + 1
$$;
alter function public.list_conversation_messages(uuid, uuid, timestamptz, integer) owner to postgres;
revoke all on function public.list_conversation_messages(uuid, uuid, timestamptz, integer)
from public, anon, authenticated;
grant execute on function public.list_conversation_messages(uuid, uuid, timestamptz, integer)
to authenticated;

create function public.assign_conversation(p_clinic_id uuid, p_conversation_id uuid, p_to_user_id uuid)
returns integer language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare v_actor uuid := (select auth.uid()); v_from uuid; v_version integer;
begin
  if v_actor is null or not app_private.is_clinic_member(p_clinic_id)
    or not app_private.has_permission(p_clinic_id, 'conversation.assign') then
    raise exception using errcode = '42501', message = 'conversation access denied';
  end if;
  if not exists (select 1 from public.clinic_members cm where cm.clinic_id = p_clinic_id
    and cm.user_id = p_to_user_id and cm.status = 'active') then
    raise exception using errcode = '22023', message = 'invalid conversation assignee';
  end if;
  select c.assigned_to_user_id into v_from from public.conversations c
  where c.clinic_id = p_clinic_id and c.id = p_conversation_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'conversation not found'; end if;
  update public.conversations c set assigned_to_user_id = p_to_user_id, version = version + 1
  where c.clinic_id = p_clinic_id and c.id = p_conversation_id returning version into v_version;
  if v_from is distinct from p_to_user_id then
    insert into public.conversation_assignments(clinic_id, conversation_id, from_user_id, to_user_id, assigned_by)
    values (p_clinic_id, p_conversation_id, v_from, p_to_user_id, v_actor);
  end if;
  return v_version;
end $$;
alter function public.assign_conversation(uuid, uuid, uuid) owner to postgres;
revoke all on function public.assign_conversation(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_conversation(uuid, uuid, uuid) to authenticated;

create function public.mark_conversation_read(p_clinic_id uuid, p_conversation_id uuid)
returns integer language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare v_actor uuid := (select auth.uid()); v_version integer;
begin
  if v_actor is null or not app_private.is_clinic_member(p_clinic_id)
    or not (app_private.has_permission(p_clinic_id, 'conversation.view_all')
      or app_private.has_permission(p_clinic_id, 'conversation.view_own')) then
    raise exception using errcode = '42501', message = 'conversation access denied';
  end if;
  update public.conversations c set unread_count = 0, last_read_at = statement_timestamp(), version = version + 1
  where c.clinic_id = p_clinic_id and c.id = p_conversation_id
    and (app_private.has_permission(p_clinic_id, 'conversation.view_all') or c.assigned_to_user_id = v_actor)
  returning version into v_version;
  if not found then raise exception using errcode = 'P0002', message = 'conversation not found'; end if;
  return v_version;
end $$;
alter function public.mark_conversation_read(uuid, uuid) owner to postgres;
revoke all on function public.mark_conversation_read(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_conversation_read(uuid, uuid) to authenticated;

create function public.set_conversation_state(p_clinic_id uuid, p_conversation_id uuid, p_state text)
returns integer language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare v_version integer;
begin
  if (select auth.uid()) is null or not app_private.is_clinic_member(p_clinic_id)
    or not app_private.has_permission(p_clinic_id, 'conversation.manage') then
    raise exception using errcode = '42501', message = 'conversation access denied';
  end if;
  if p_state not in ('open', 'closed') then raise exception using errcode = '22023', message = 'invalid conversation state'; end if;
  update public.conversations c
  set state = p_state, closed_at = case when p_state = 'closed' then statement_timestamp() else null end,
      version = version + 1
  where c.clinic_id = p_clinic_id and c.id = p_conversation_id
  returning version into v_version;
  if not found then raise exception using errcode = 'P0002', message = 'conversation not found'; end if;
  return v_version;
end $$;
alter function public.set_conversation_state(uuid, uuid, text) owner to postgres;
revoke all on function public.set_conversation_state(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_conversation_state(uuid, uuid, text) to authenticated;

create function public.create_whatsapp_outbound_message(
  p_clinic_id uuid, p_conversation_id uuid, p_idempotency_key uuid,
  p_message_type text, p_text_content text, p_attachment_metadata jsonb
)
returns table(message_id uuid, attempt_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare v_actor uuid := (select auth.uid()); v_conversation public.conversations;
  v_message_id uuid; v_attempt_id uuid;
begin
  if v_actor is null or not app_private.is_clinic_member(p_clinic_id)
    or not app_private.has_permission(p_clinic_id, 'conversation.send') then
    raise exception using errcode = '42501', message = 'conversation access denied';
  end if;
  if p_idempotency_key is null
    or p_message_type not in ('text', 'audio', 'image', 'video', 'document', 'location', 'contact', 'unknown')
    or (p_message_type = 'text' and coalesce(trim(p_text_content), '') = '')
    or (p_text_content is not null and char_length(p_text_content) > 65535)
    or jsonb_typeof(coalesce(p_attachment_metadata, '{}'::jsonb)) <> 'object'
    or coalesce(p_attachment_metadata, '{}'::jsonb) - array[
      'caption', 'fileName', 'latitude', 'longitude', 'mediaId',
      'mimeType', 'sha256', 'sizeBytes'
    ] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'invalid outbound message';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_clinic_id::text || ':' || p_idempotency_key::text, 76
  ));
  select c.* into v_conversation from public.conversations c
  where c.clinic_id = p_clinic_id and c.id = p_conversation_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'conversation not found'; end if;
  if not app_private.has_permission(p_clinic_id, 'conversation.view_all')
    and v_conversation.assigned_to_user_id is distinct from v_actor then
    raise exception using errcode = '42501', message = 'conversation access denied';
  end if;
  select m.id into v_message_id from public.messages m
  where m.clinic_id = p_clinic_id and m.idempotency_key = p_idempotency_key
    and m.conversation_id = p_conversation_id;
  if v_message_id is null and exists (
    select 1 from public.messages m where m.clinic_id = p_clinic_id
      and m.idempotency_key = p_idempotency_key
  ) then
    raise exception using errcode = '23505', message = 'outbound idempotency conflict';
  end if;
  if v_message_id is null then
    insert into public.messages(
      clinic_id, conversation_id, whatsapp_account_id, contact_id, opportunity_id,
      direction, idempotency_key, message_type, text_content, attachment_metadata,
      occurred_at
    ) values (
      p_clinic_id, v_conversation.id, v_conversation.whatsapp_account_id,
      v_conversation.contact_id, v_conversation.opportunity_id, 'outbound', p_idempotency_key,
      p_message_type, p_text_content, coalesce(p_attachment_metadata, '{}'::jsonb),
      statement_timestamp()
    ) returning id into v_message_id;
    insert into public.message_status_events(clinic_id, message_id, status, applied, occurred_at)
    values (p_clinic_id, v_message_id, 'pending', true, statement_timestamp());
    insert into public.message_delivery_attempts(clinic_id, message_id, attempt_number, status)
    values (p_clinic_id, v_message_id, 1, 'pending') returning id into v_attempt_id;
    update public.conversations c set last_message_id = v_message_id,
      last_message_at = statement_timestamp(), needs_reply_from = 'contact', version = version + 1
    where c.clinic_id = p_clinic_id and c.id = p_conversation_id;
  else
    select a.id into v_attempt_id from public.message_delivery_attempts a
    where a.clinic_id = p_clinic_id and a.message_id = v_message_id
    order by a.attempt_number limit 1;
  end if;
  return query select v_message_id, v_attempt_id;
end $$;
alter function public.create_whatsapp_outbound_message(uuid, uuid, uuid, text, text, jsonb) owner to postgres;
revoke all on function public.create_whatsapp_outbound_message(uuid, uuid, uuid, text, text, jsonb)
from public, anon, authenticated;
grant execute on function public.create_whatsapp_outbound_message(uuid, uuid, uuid, text, text, jsonb)
to authenticated;
