-- Revisão F1 (B-1) — convites nunca alteram memberships existentes.

create or replace function public.invite_member(
  clinic_id uuid,
  member_email text,
  member_role text,
  token_hash text,
  expires_at timestamptz
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
  v_invitation_id uuid;
begin
  perform app_private.require_aal2();
  if not app_private.has_permission(clinic_id, 'member.invite')
    or not app_private.can_assign_role(clinic_id, member_role)
    or member_role = 'owner'
  then
    raise exception using errcode = '42501', message = 'operation not allowed';
  end if;
  if member_email is null
    or lower(trim(member_email)) <> member_email
    or char_length(member_email) not between 3 and 320
    or member_email not like '%@%'
    or token_hash !~ '^[a-f0-9]{64}$'
    or expires_at <= statement_timestamp()
    or expires_at > statement_timestamp() + interval '30 days'
  then
    raise exception using errcode = '22023', message = 'invalid invitation';
  end if;

  perform 1 from public.clinics as c
  where c.id = clinic_id and c.status = 'active' and c.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'operation not allowed';
  end if;

  perform 1
  from public.clinic_members as cm
  join auth.users as u on u.id = cm.user_id and u.deleted_at is null
  where cm.clinic_id = clinic_id
    and cm.status in ('active', 'suspended')
    and lower(trim(u.email)) = member_email
  for update of cm;
  if found then
    raise exception using errcode = '42501', message = 'operation not allowed';
  end if;

  update public.invitations as i
  set status = 'revoked'
  where i.clinic_id = clinic_id
    and lower(i.email) = member_email
    and i.status = 'pending';

  insert into public.invitations (
    clinic_id, email, role, token_hash, expires_at, invited_by
  )
  values (
    clinic_id, member_email, member_role, token_hash, expires_at, v_actor_id
  )
  returning id into v_invitation_id;

  perform app_private.log_activity(
    clinic_id, 'member.invited',
    jsonb_build_object('invitation_id', v_invitation_id, 'role', member_role)
  );
  perform app_private.log_audit_event(
    clinic_id, 'member.invited', 'invitation', v_invitation_id,
    null,
    jsonb_build_object('email', member_email, 'role', member_role, 'status', 'pending'),
    null
  );
  return v_invitation_id;
end;
$$;
alter function public.invite_member(uuid, text, text, text, timestamptz)
  owner to postgres;
revoke all on function public.invite_member(uuid, text, text, text, timestamptz)
  from public, anon;
grant execute on function public.invite_member(uuid, text, text, text, timestamptz)
  to authenticated;

create or replace function public.accept_invitation(token_hash text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_email text;
  v_confirmed_at timestamptz;
  v_invitation public.invitations%rowtype;
  v_existing_membership public.clinic_members%rowtype;
begin
  if v_actor_id is null or token_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '42501', message = 'invitation unavailable';
  end if;
  select lower(trim(u.email)), u.email_confirmed_at
    into v_actor_email, v_confirmed_at
  from auth.users as u
  where u.id = v_actor_id and u.deleted_at is null;
  if not found or v_confirmed_at is null then
    raise exception using errcode = '42501', message = 'invitation unavailable';
  end if;

  select i.* into v_invitation
  from public.invitations as i
  join public.clinics as c on c.id = i.clinic_id
  where i.token_hash = accept_invitation.token_hash
    and i.status = 'pending'
    and i.expires_at > statement_timestamp()
    and c.status = 'active'
    and c.deleted_at is null
  for update of i;
  if not found
    or v_invitation.email <> v_actor_email
    or v_invitation.role = 'owner'
  then
    raise exception using errcode = '42501', message = 'invitation unavailable';
  end if;

  select cm.* into v_existing_membership
  from public.clinic_members as cm
  where cm.clinic_id = v_invitation.clinic_id
    and cm.user_id = v_actor_id
  for update;
  if found and v_existing_membership.status in ('active', 'suspended') then
    raise exception using errcode = '42501', message = 'invitation unavailable';
  end if;

  insert into public.clinic_members (clinic_id, user_id, role, status)
  values (v_invitation.clinic_id, v_actor_id, v_invitation.role, 'active');
  update public.invitations as i
  set status = 'accepted'
  where i.id = v_invitation.id;

  perform app_private.log_activity(
    v_invitation.clinic_id, 'member.invitation_accepted',
    jsonb_build_object('invitation_id', v_invitation.id, 'role', v_invitation.role)
  );
  perform app_private.log_audit_event(
    v_invitation.clinic_id, 'member.invitation_accepted', 'invitation',
    v_invitation.id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'accepted', 'role', v_invitation.role),
    null
  );
  return v_invitation.clinic_id;
end;
$$;
alter function public.accept_invitation(text) owner to postgres;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
