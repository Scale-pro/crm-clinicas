-- Onda 2 — fecha o loop de envio, guarda a credencial do provedor e leva o
-- estado de conversa para o quadro do pipeline.
--
-- Nada aqui é específico da UAZAPI: a credencial é opaca (texto cifrado pela
-- aplicação) e o resultado do envio é descrito pelo vocabulário que
-- `message_status_events` já usa. Trocar de provedor não toca este arquivo.

-- ---------------------------------------------------------------------------
-- 1. Credencial da conta do provedor (ADR-012).
-- ---------------------------------------------------------------------------
-- O token chega já cifrado (AES-256-GCM na aplicação, chave em variável de
-- ambiente). O banco guarda texto opaco: nem a chave nem o token em claro
-- passam por parâmetro de RPC, log de query ou dump. A tabela vive em
-- `app_private`, cujo `usage` já é revogado de public/anon/authenticated, então
-- nenhuma sessão de usuário a alcança nem por engano.

create table app_private.whatsapp_account_secrets (
  whatsapp_account_id uuid primary key,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  token_encrypted text not null check (char_length(token_encrypted) between 1 and 8192),
  key_version integer not null default 1 check (key_version >= 1),
  rotated_by uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint whatsapp_account_secrets_account_fkey
    foreign key (clinic_id, whatsapp_account_id)
    references public.whatsapp_accounts(clinic_id, id)
    on update cascade on delete cascade,
  constraint whatsapp_account_secrets_rotated_by_fkey
    foreign key (clinic_id, rotated_by)
    references public.clinic_members(clinic_id, user_id)
    on update cascade on delete restrict
);

alter table app_private.whatsapp_account_secrets enable row level security;
alter table app_private.whatsapp_account_secrets force row level security;
revoke all on table app_private.whatsapp_account_secrets
from public, anon, authenticated, service_role;

create trigger whatsapp_account_secrets_set_updated_at
before update on app_private.whatsapp_account_secrets
for each row execute function public.set_updated_at();

-- Mesma autorização de `create_whatsapp_account` (clinic.manage + AAL2):
-- configurar a credencial do provedor é ajuste de clínica.
create function public.set_whatsapp_account_secret(
  p_clinic_id uuid,
  p_whatsapp_account_id uuid,
  p_token_encrypted text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(p_clinic_id)
    or not app_private.has_permission(p_clinic_id, 'clinic.manage')
  then
    raise exception using errcode = '42501', message = 'whatsapp account access denied';
  end if;
  perform app_private.require_aal2();

  if p_token_encrypted is null
    or char_length(p_token_encrypted) not between 1 and 8192
  then
    raise exception using errcode = '22023', message = 'invalid whatsapp credential';
  end if;

  if not exists (
    select 1 from public.whatsapp_accounts wa
    where wa.clinic_id = p_clinic_id and wa.id = p_whatsapp_account_id
  ) then
    raise exception using errcode = 'P0002', message = 'whatsapp account not found';
  end if;

  insert into app_private.whatsapp_account_secrets(
    whatsapp_account_id, clinic_id, token_encrypted, rotated_by
  ) values (
    p_whatsapp_account_id, p_clinic_id, p_token_encrypted, v_actor_id
  )
  on conflict (whatsapp_account_id) do update
  set token_encrypted = excluded.token_encrypted,
      rotated_by = excluded.rotated_by;

  -- Auditoria sem token e sem identificador do provedor.
  perform app_private.log_audit_event(
    p_clinic_id, 'whatsapp_account.credential_rotated', 'whatsapp_account',
    p_whatsapp_account_id, null, '{}'::jsonb, null
  );
end;
$$;
alter function public.set_whatsapp_account_secret(uuid, uuid, text) owner to postgres;
revoke all on function public.set_whatsapp_account_secret(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.set_whatsapp_account_secret(uuid, uuid, text)
to authenticated;

-- Leitura da credencial: exclusiva do worker de envio (service role). Devolve o
-- texto cifrado — quem decifra é a aplicação, que detém a chave.
create function public.get_whatsapp_send_credential(p_message_id uuid)
returns table(
  clinic_id uuid,
  whatsapp_account_id uuid,
  provider text,
  external_account_id text,
  token_encrypted text,
  key_version integer,
  phone_e164 text,
  message_type text,
  text_content text,
  attachment_metadata jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.clinic_id,
    m.whatsapp_account_id,
    wa.provider,
    wa.external_account_id,
    s.token_encrypted,
    s.key_version,
    phone.normalized_value,
    m.message_type,
    m.text_content,
    m.attachment_metadata
  from public.messages m
  join public.whatsapp_accounts wa
    on wa.clinic_id = m.clinic_id and wa.id = m.whatsapp_account_id
   and wa.status = 'active'
  join app_private.whatsapp_account_secrets s
    on s.whatsapp_account_id = wa.id
  left join lateral (
    select pc.normalized_value
    from public.person_contacts pc
    where pc.clinic_id = m.clinic_id and pc.contact_id = m.contact_id
      and pc.kind = 'phone' and pc.is_whatsapp and pc.archived_at is null
    order by pc.is_primary desc, pc.created_at, pc.id
    limit 1
  ) phone on true
  where m.id = p_message_id and m.direction = 'outbound'
$$;
alter function public.get_whatsapp_send_credential(uuid) owner to postgres;
revoke all on function public.get_whatsapp_send_credential(uuid)
from public, anon, authenticated;
grant execute on function public.get_whatsapp_send_credential(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Encerrar eventos que o adapter classifica como irrelevantes.
-- ---------------------------------------------------------------------------
-- Sem isto, um evento sem mensagem e sem status ficaria `pending` para sempre e
-- poluiria o painel de eventos pendentes, indistinguível de um evento que
-- ninguém processou.
create function public.mark_whatsapp_event_ignored(p_event_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.whatsapp_webhook_events we
  set processing_status = 'processed',
      processed_at = statement_timestamp(),
      attempt_count = attempt_count + 1,
      last_error_code = null,
      next_retry_at = null
  where we.id = p_event_id
    and we.processing_status in ('pending', 'processing', 'failed');
  return found;
end;
$$;
alter function public.mark_whatsapp_event_ignored(uuid) owner to postgres;
revoke all on function public.mark_whatsapp_event_ignored(uuid)
from public, anon, authenticated;
grant execute on function public.mark_whatsapp_event_ignored(uuid) to service_role;

-- Carrega o evento para o worker. Existe como RPC — e não como leitura direta
-- de tabela — para que o cliente técnico do webhook precise apenas de `rpc`:
-- sem `from()`, uma rota comprometida não consegue varrer tabela nenhuma.
create function public.get_whatsapp_event_for_processing(p_event_id uuid)
returns table(
  event_id uuid,
  clinic_id uuid,
  whatsapp_account_id uuid,
  provider text,
  event_type text,
  processing_status text,
  raw_payload jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select we.id, we.clinic_id, we.whatsapp_account_id, we.provider,
    we.event_type, we.processing_status, we.raw_payload
  from public.whatsapp_webhook_events we
  where we.id = p_event_id
$$;
alter function public.get_whatsapp_event_for_processing(uuid) owner to postgres;
revoke all on function public.get_whatsapp_event_for_processing(uuid)
from public, anon, authenticated;
grant execute on function public.get_whatsapp_event_for_processing(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Resultado do envio.
-- ---------------------------------------------------------------------------
-- `create_whatsapp_outbound_message` grava a intenção com
-- `external_message_id = null`. Enquanto ele continuar nulo,
-- `record_whatsapp_message_status` — que procura a mensagem pelo id do provedor
-- — nunca encontra a mensagem enviada, e nenhum callback de entrega/leitura se
-- aplica. Esta função é o elo que liga a tentativa ao id do provedor.
create function public.record_whatsapp_send_result(
  p_clinic_id uuid,
  p_message_id uuid,
  p_attempt_id uuid,
  p_external_message_id text,
  p_status text,
  p_error_code text,
  p_occurred_at timestamptz
)
returns table(applied boolean, duplicate boolean, external_message_id text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_attempt public.message_delivery_attempts;
  v_message public.messages;
  v_external_id text;
  v_current_status text;
  v_current_rank integer;
  v_applied boolean;
  v_claimed_by uuid;
begin
  if p_status not in ('sent', 'failed')
    or p_occurred_at is null
    or (p_status = 'sent' and coalesce(trim(p_external_message_id), '') = '')
    or (p_status = 'sent' and p_error_code is not null)
    or (p_error_code is not null and p_error_code !~ '^[a-z][a-z0-9_.-]{1,79}$')
    or (p_external_message_id is not null
      and char_length(p_external_message_id) not between 1 and 240)
  then
    raise exception using errcode = '22023', message = 'invalid send result';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_clinic_id::text || ':' || p_message_id::text, 78)
  );

  select a.* into v_attempt
  from public.message_delivery_attempts a
  where a.clinic_id = p_clinic_id and a.id = p_attempt_id and a.message_id = p_message_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'delivery attempt not found';
  end if;

  select m.* into v_message
  from public.messages m
  where m.clinic_id = p_clinic_id and m.id = p_message_id and m.direction = 'outbound'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'outbound message not found';
  end if;

  -- Idempotência: a tentativa só sai de `pending` uma vez. Reentrega da fila
  -- devolve o resultado já gravado em vez de duplicar evento de status.
  if v_attempt.status <> 'pending' then
    return query select true, true, v_message.external_message_id;
    return;
  end if;

  v_external_id := v_message.external_message_id;

  if p_status = 'sent' then
    if v_external_id is null then
      -- A mesma conta pode espelhar a mensagem recém-enviada por webhook antes
      -- de a resposta HTTP do provedor chegar aqui. Nesse caso o id já pertence
      -- a outra linha e a unique `messages_external_message_key` recusaria o
      -- update: a tentativa foi bem-sucedida do mesmo jeito, e a linha
      -- espelhada é quem carrega os callbacks de status.
      select m.id into v_claimed_by
      from public.messages m
      where m.external_message_key =
        v_message.whatsapp_account_id::text || ':' || trim(p_external_message_id);

      if v_claimed_by is null then
        update public.messages m
        set external_message_id = trim(p_external_message_id)
        where m.clinic_id = p_clinic_id and m.id = p_message_id;
        v_external_id := trim(p_external_message_id);
      elsif v_claimed_by = p_message_id then
        v_external_id := trim(p_external_message_id);
      end if;
    end if;

    update public.message_delivery_attempts a
    set status = 'sent', error_code = null, completed_at = statement_timestamp()
    where a.clinic_id = p_clinic_id and a.id = p_attempt_id;
  else
    update public.message_delivery_attempts a
    set status = 'failed', error_code = p_error_code, completed_at = statement_timestamp()
    where a.clinic_id = p_clinic_id and a.id = p_attempt_id;
  end if;

  -- Mesmo ranking monotônico de `record_whatsapp_message_status`: um resultado
  -- que chega atrasado nunca rebaixa um status já observado.
  select mse.status,
    case mse.status when 'pending' then 0 when 'sent' then 1
      when 'delivered' then 2 when 'read' then 3 else -1 end
    into v_current_status, v_current_rank
  from public.message_status_events mse
  where mse.clinic_id = p_clinic_id and mse.message_id = p_message_id and mse.applied
  order by case mse.status when 'read' then 3 when 'delivered' then 2
    when 'sent' then 1 when 'pending' then 0 else -1 end desc,
    mse.occurred_at desc, mse.created_at desc, mse.id desc
  limit 1;
  v_current_rank := coalesce(v_current_rank, -1);
  v_applied := case
    when p_status = 'failed' then coalesce(v_current_status, '') <> 'read'
    else 1 >= v_current_rank
  end;

  insert into public.message_status_events(
    clinic_id, message_id, webhook_event_id, status, applied, occurred_at
  ) values (
    p_clinic_id, p_message_id, null, p_status, v_applied, p_occurred_at
  )
  on conflict do nothing;

  return query select v_applied, false, v_external_id;
end;
$$;
alter function public.record_whatsapp_send_result(uuid, uuid, uuid, text, text, text, timestamptz)
  owner to postgres;
revoke all on function public.record_whatsapp_send_result(uuid, uuid, uuid, text, text, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.record_whatsapp_send_result(uuid, uuid, uuid, text, text, text, timestamptz)
to service_role;

-- ---------------------------------------------------------------------------
-- 4. Estado de conversa no quadro do pipeline.
-- ---------------------------------------------------------------------------
-- O card precisa mostrar não lidas, prévia da última mensagem e quem deve a
-- resposta; sem isto a conversa e a oportunidade vivem em telas separadas.
-- A função continua `security invoker`: é a RLS de `conversations`/`messages`
-- que decide se o join enxerga algo. Quem não tem permissão de conversa
-- simplesmente recebe as colunas nulas, sem erro e sem vazamento.
--
-- O lateral garante uma linha por oportunidade: mais de uma conta de WhatsApp
-- na mesma clínica poderia render duas conversas para a mesma oportunidade e
-- duplicar cards, quebrando contagem e paginação.
drop function public.search_opportunity_board(
  uuid, uuid, text, text, uuid, uuid, integer, integer
);

create function public.search_opportunity_board(
  p_clinic_id uuid,
  p_pipeline_id uuid,
  p_search_term text,
  p_status text,
  p_assigned_to_user_id uuid,
  p_initial_source_id uuid,
  p_unread_only boolean,
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
  stage_position integer,
  pipeline_name text,
  pipeline_archived_at timestamptz,
  conversation_id uuid,
  conversation_unread_count integer,
  conversation_needs_reply_from text,
  conversation_last_message_at timestamptz,
  conversation_last_message_type text,
  conversation_last_message_direction text,
  conversation_last_message_text text
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
    ps.position as stage_position,
    p.name as pipeline_name,
    p.archived_at as pipeline_archived_at,
    conversation.id,
    conversation.unread_count,
    conversation.needs_reply_from,
    conversation.last_message_at,
    conversation.last_message_type,
    conversation.last_message_direction,
    conversation.last_message_text
  from public.opportunities as o
  join public.contacts as c
    on c.clinic_id = o.clinic_id
   and c.id = o.contact_id
  join public.pipelines as p
    on p.clinic_id = o.clinic_id
   and p.id = o.pipeline_id
  join public.pipeline_stages as ps
    on ps.clinic_id = o.clinic_id
   and ps.id = o.stage_id
   and ps.pipeline_id = o.pipeline_id
  left join lateral (
    select conv.id, conv.unread_count, conv.needs_reply_from, conv.last_message_at,
      last_message.message_type as last_message_type,
      last_message.direction as last_message_direction,
      last_message.text_content as last_message_text
    from public.conversations conv
    left join public.messages last_message
      on last_message.clinic_id = conv.clinic_id
     and last_message.id = conv.last_message_id
    where conv.clinic_id = o.clinic_id and conv.opportunity_id = o.id
    order by conv.unread_count > 0 desc, conv.last_message_at desc nulls last, conv.id
    limit 1
  ) conversation on true
  where o.clinic_id = p_clinic_id
    and (p_pipeline_id is null or o.pipeline_id = p_pipeline_id)
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
      not coalesce(p_unread_only, false)
      or coalesce(conversation.unread_count, 0) > 0
    )
    and (
      coalesce(p_search_term, '') = ''
      or position(lower(p_search_term) in lower(o.title)) > 0
      or position(lower(p_search_term) in lower(c.full_name)) > 0
    )
  order by p.name, p.id, ps.position, o.board_position, o.id
  limit case
    when p_page between 1 and 1000000
      and p_page_size between 1 and 100
    then p_page_size + 1
    else 0
  end
  offset case
    when p_page between 1 and 1000000
      and p_page_size between 1 and 100
    then (p_page - 1) * p_page_size
    else 0
  end;
$$;

alter function public.search_opportunity_board(
  uuid, uuid, text, text, uuid, uuid, boolean, integer, integer
) owner to postgres;
revoke all on function public.search_opportunity_board(
  uuid, uuid, text, text, uuid, uuid, boolean, integer, integer
) from public, anon, authenticated;
grant execute on function public.search_opportunity_board(
  uuid, uuid, text, text, uuid, uuid, boolean, integer, integer
) to authenticated;

-- Sustenta o lateral do quadro: a busca é por oportunidade dentro do tenant.
create index conversations_clinic_opportunity_idx
  on public.conversations(clinic_id, opportunity_id)
  where opportunity_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Realtime.
-- ---------------------------------------------------------------------------
-- A publicação respeita a RLS de cada tabela, então a subscrição do cliente não
-- alcança nada além do que as políticas de `conversations`/`messages` já
-- liberam para aquele usuário.
-- A publicação é criada pela plataforma Supabase, não por estas migrations. Um
-- Postgres puro (o dos testes de integração) não a tem, e falhar ali só
-- impediria de testar o resto.
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.conversations';
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end;
$$;
