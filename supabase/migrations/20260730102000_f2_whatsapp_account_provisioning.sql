-- Onda 1 — provisionamento autorizado de conta WhatsApp.
--
-- Sem esta RPC não existe caminho autorizado para criar `whatsapp_accounts`, e
-- `ingest_whatsapp_event` sempre falha com 'whatsapp account not found'. A
-- alternativa seria insert direto por service role, que contraria o invariante
-- de que escrita de tenant passa por RPC autorizada.
--
-- Autorização por `clinic.manage` (owner e admin), a mesma permissão que já
-- governa `update_clinic_settings`: configurar a conta de um provedor é
-- ajuste de clínica, não operação de atendimento.

create function public.create_whatsapp_account(
  clinic_id uuid,
  provider text,
  external_account_id text,
  display_phone text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
  v_account_key text;
  v_display_phone text;
  v_existing public.whatsapp_accounts;
  v_id uuid;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'clinic.manage')
  then
    raise exception using errcode = '42501', message = 'whatsapp account access denied';
  end if;
  perform app_private.require_aal2();

  if provider is null or provider !~ '^[a-z][a-z0-9_-]{1,39}$'
    or external_account_id is null
    or char_length(trim(external_account_id)) not between 1 and 200
  then
    raise exception using errcode = '22023', message = 'invalid whatsapp account';
  end if;

  v_display_phone := nullif(trim(coalesce(display_phone, '')), '');
  if v_display_phone is not null then
    begin
      v_display_phone := app_private.normalize_whatsapp_phone(v_display_phone);
    exception when sqlstate '22023' then
      raise exception using errcode = '22023', message = 'invalid whatsapp account';
    end;
  end if;

  v_account_key := provider || ':' || trim(external_account_id);

  -- `account_key` é único global e é a âncora que resolve o tenant na ingestão,
  -- então ele já serve de chave de idempotência: reexecutar devolve a mesma
  -- conta em vez de criar outra.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_account_key, 77)
  );

  select account.* into v_existing
  from public.whatsapp_accounts as account
  where account.account_key = v_account_key;

  if found then
    -- Reivindicação por outra clínica não revela qual: a mensagem é a mesma
    -- que o chamador veria para qualquer conflito de conta já cadastrada.
    if v_existing.clinic_id <> clinic_id then
      raise exception using errcode = 'P4304', message = 'whatsapp account already claimed';
    end if;
    return v_existing.id;
  end if;

  insert into public.whatsapp_accounts (
    clinic_id, provider, external_account_id, display_phone_e164, configured_by
  ) values (
    clinic_id, provider, trim(external_account_id), v_display_phone, v_actor_id
  )
  returning id into v_id;

  -- Sem telefone e sem identificador do provedor no registro de auditoria.
  perform app_private.log_audit_event(
    clinic_id, 'whatsapp_account.created', 'whatsapp_account', v_id,
    null, jsonb_build_object('provider', provider, 'status', 'active'), null
  );

  return v_id;
end;
$$;

alter function public.create_whatsapp_account(uuid, text, text, text) owner to postgres;
revoke all on function public.create_whatsapp_account(uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.create_whatsapp_account(uuid, text, text, text)
to authenticated;
