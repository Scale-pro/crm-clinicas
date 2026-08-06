-- F4 — mutações seguras de agendamentos.
--
-- Toda escrita passa por aqui (ADR-002): identidade, tenant, permissão, AAL2 e
-- parâmetros são validados dentro da função. Duração e preço, quando omitidos,
-- são resolvidos do catálogo (vínculo profissional×procedimento > procedimento)
-- e congelados na linha.

create function public.create_appointment(
  clinic_id uuid,
  contact_id uuid,
  professional_id uuid,
  procedure_id uuid,
  custom_procedure_name text,
  start_at timestamptz,
  duration_minutes integer,
  price_cents bigint,
  notes text,
  idempotency_key uuid
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
  v_duration integer := duration_minutes;
  v_existing_id uuid;
  v_id uuid;
  v_price bigint := price_cents;
  v_procedure public.procedures;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'appointment.manage')
  then
    raise exception using errcode = '42501', message = 'appointment access denied';
  end if;
  perform app_private.require_aal2();

  if idempotency_key is null or contact_id is null or professional_id is null
    or start_at is null
    or (procedure_id is null) = (custom_procedure_name is null)
    or (custom_procedure_name is not null
      and char_length(trim(custom_procedure_name)) not between 2 and 160)
    or (duration_minutes is not null and duration_minutes not between 5 and 1440)
    or (price_cents is not null and price_cents not between 0 and 9007199254740991)
    or (notes is not null and char_length(notes) > 2000)
  then
    raise exception using errcode = '22023', message = 'invalid appointment';
  end if;

  perform 1 from public.contacts as contact
  where contact.clinic_id = clinic_id and contact.id = contact_id
    and contact.archived_at is null;
  if not found then
    raise exception using errcode = 'P4315', message = 'appointment contact not found';
  end if;

  perform 1 from public.professionals as professional
  where professional.clinic_id = clinic_id and professional.id = professional_id
    and professional.status = 'active' and professional.archived_at is null;
  if not found then
    raise exception using errcode = 'P4301', message = 'professional not found';
  end if;

  if procedure_id is not null then
    select procedure.* into v_procedure
    from public.procedures as procedure
    where procedure.clinic_id = clinic_id and procedure.id = procedure_id
      and procedure.status = 'active' and procedure.archived_at is null;
    if not found then
      raise exception using errcode = 'P4305', message = 'procedure not found';
    end if;
    if v_duration is null or v_price is null then
      select
        coalesce(v_duration,
          link.duration_minutes_override, v_procedure.default_duration_minutes),
        coalesce(v_price, link.price_cents_override, v_procedure.base_price_cents)
      into v_duration, v_price
      from (select 1) as one
      left join public.professional_procedures as link
        on link.clinic_id = clinic_id
        and link.professional_id = professional_id
        and link.procedure_id = procedure_id
        and link.status = 'active' and link.archived_at is null;
    end if;
  end if;
  if v_duration is null or v_price is null then
    raise exception using errcode = '22023', message = 'invalid appointment';
  end if;

  select appointment.id into v_existing_id
  from public.appointments as appointment
  where appointment.clinic_id = clinic_id
    and appointment.creation_idempotency_key = idempotency_key;
  if found then return v_existing_id; end if;

  begin
    insert into public.appointments (
      clinic_id, contact_id, professional_id, procedure_id, custom_procedure_name,
      start_at, duration_minutes, price_cents, notes,
      creation_idempotency_key, created_by, updated_by
    ) values (
      clinic_id, contact_id, professional_id, procedure_id,
      nullif(trim(coalesce(custom_procedure_name, '')), ''),
      start_at, v_duration, v_price, notes,
      idempotency_key, v_actor_id, v_actor_id
    ) returning id into v_id;
  exception when unique_violation then
    select appointment.id into v_existing_id
    from public.appointments as appointment
    where appointment.clinic_id = clinic_id
      and appointment.creation_idempotency_key = idempotency_key;
    if found then return v_existing_id; end if;
    raise;
  end;

  perform app_private.log_audit_event(
    clinic_id, 'appointment.created', 'appointment', v_id,
    null, jsonb_build_object('version', 1, 'status', 'confirmed'), null
  );
  return v_id;
end;
$$;

create function public.update_appointment_status(
  clinic_id uuid,
  appointment_id uuid,
  new_status text,
  expected_version integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
  v_appointment public.appointments;
  v_new_version integer;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'appointment.manage')
  then
    raise exception using errcode = '42501', message = 'appointment access denied';
  end if;
  perform app_private.require_aal2();
  if new_status is null
    or new_status not in ('scheduled', 'confirmed', 'arrived', 'in_service', 'paid', 'canceled')
    or expected_version is null or expected_version < 1
  then
    raise exception using errcode = '22023', message = 'invalid appointment';
  end if;

  select appointment.* into v_appointment
  from public.appointments as appointment
  where appointment.clinic_id = clinic_id and appointment.id = appointment_id
  for update;
  if not found then
    raise exception using errcode = 'P4311', message = 'appointment not found';
  end if;
  if v_appointment.status = new_status then return v_appointment.version; end if;
  -- Cancelamento é terminal: reativar exige um novo agendamento auditável.
  if v_appointment.status = 'canceled' then
    raise exception using errcode = 'P4312', message = 'appointment canceled';
  end if;
  if v_appointment.version <> expected_version then
    raise exception using errcode = 'P4091', message = 'appointment version conflict';
  end if;

  update public.appointments as appointment set
    status = new_status, version = appointment.version + 1, updated_by = v_actor_id
  where appointment.clinic_id = clinic_id and appointment.id = appointment_id
    and appointment.version = expected_version
  returning appointment.version into v_new_version;
  if not found then
    raise exception using errcode = 'P4091', message = 'appointment version conflict';
  end if;

  perform app_private.log_audit_event(
    clinic_id, 'appointment.status_changed', 'appointment', appointment_id,
    jsonb_build_object('version', v_appointment.version, 'status', v_appointment.status),
    jsonb_build_object('version', v_new_version, 'status', new_status), null
  );
  return v_new_version;
end;
$$;

create function public.reschedule_appointment(
  clinic_id uuid,
  appointment_id uuid,
  professional_id uuid,
  start_at timestamptz,
  duration_minutes integer,
  expected_version integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
  v_appointment public.appointments;
  v_new_version integer;
begin
  if v_actor_id is null
    or not app_private.is_clinic_member(clinic_id)
    or not app_private.has_permission(clinic_id, 'appointment.manage')
  then
    raise exception using errcode = '42501', message = 'appointment access denied';
  end if;
  perform app_private.require_aal2();
  if professional_id is null or start_at is null
    or duration_minutes is null or duration_minutes not between 5 and 1440
    or expected_version is null or expected_version < 1
  then
    raise exception using errcode = '22023', message = 'invalid appointment';
  end if;

  select appointment.* into v_appointment
  from public.appointments as appointment
  where appointment.clinic_id = clinic_id and appointment.id = appointment_id
  for update;
  if not found then
    raise exception using errcode = 'P4311', message = 'appointment not found';
  end if;
  if v_appointment.status = 'canceled' then
    raise exception using errcode = 'P4312', message = 'appointment canceled';
  end if;
  if v_appointment.version <> expected_version then
    raise exception using errcode = 'P4091', message = 'appointment version conflict';
  end if;

  perform 1 from public.professionals as professional
  where professional.clinic_id = clinic_id and professional.id = professional_id
    and professional.status = 'active' and professional.archived_at is null;
  if not found then
    raise exception using errcode = 'P4301', message = 'professional not found';
  end if;

  update public.appointments as appointment set
    professional_id = professional_id, start_at = start_at,
    duration_minutes = duration_minutes,
    version = appointment.version + 1, updated_by = v_actor_id
  where appointment.clinic_id = clinic_id and appointment.id = appointment_id
    and appointment.version = expected_version
  returning appointment.version into v_new_version;
  if not found then
    raise exception using errcode = 'P4091', message = 'appointment version conflict';
  end if;

  perform app_private.log_audit_event(
    clinic_id, 'appointment.rescheduled', 'appointment', appointment_id,
    jsonb_build_object('version', v_appointment.version),
    jsonb_build_object(
      'version', v_new_version,
      'professional_changed',
        v_appointment.professional_id is distinct from professional_id
    ), null
  );
  return v_new_version;
end;
$$;

alter function public.create_appointment(
  uuid, uuid, uuid, uuid, text, timestamptz, integer, bigint, text, uuid
) owner to postgres;
alter function public.update_appointment_status(uuid, uuid, text, integer)
owner to postgres;
alter function public.reschedule_appointment(uuid, uuid, uuid, timestamptz, integer, integer)
owner to postgres;

revoke all on function public.create_appointment(
  uuid, uuid, uuid, uuid, text, timestamptz, integer, bigint, text, uuid
) from public, anon;
revoke all on function public.update_appointment_status(uuid, uuid, text, integer)
from public, anon;
revoke all on function public.reschedule_appointment(uuid, uuid, uuid, timestamptz, integer, integer)
from public, anon;

grant execute on function public.create_appointment(
  uuid, uuid, uuid, uuid, text, timestamptz, integer, bigint, text, uuid
) to authenticated;
grant execute on function public.update_appointment_status(uuid, uuid, text, integer)
to authenticated;
grant execute on function public.reschedule_appointment(uuid, uuid, uuid, timestamptz, integer, integer)
to authenticated;
