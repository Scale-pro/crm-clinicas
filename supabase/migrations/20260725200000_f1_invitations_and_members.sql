-- F1.7 — convites, matriz atribuível e invariantes de membership.

create function public.invite_member(
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

create function public.accept_invitation(token_hash text)
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

  insert into public.clinic_members (clinic_id, user_id, role, status)
  values (v_invitation.clinic_id, v_actor_id, v_invitation.role, 'active')
  on conflict (clinic_id, user_id) do update
    set role = excluded.role, status = 'active';
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

create function public.revoke_invitation(clinic_id uuid, invitation_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
begin
  perform app_private.require_aal2();
  if not app_private.has_permission(clinic_id, 'member.invite') then
    raise exception using errcode = '42501', message = 'operation not allowed';
  end if;
  update public.invitations as i
  set status = 'revoked'
  where i.id = invitation_id and i.clinic_id = clinic_id and i.status = 'pending';
  if not found then
    raise exception using errcode = '42501', message = 'operation not allowed';
  end if;
  perform app_private.log_audit_event(
    clinic_id, 'member.invitation_revoked', 'invitation', invitation_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'revoked'), null
  );
  return true;
end;
$$;
alter function public.revoke_invitation(uuid, uuid) owner to postgres;
revoke all on function public.revoke_invitation(uuid, uuid) from public, anon;
grant execute on function public.revoke_invitation(uuid, uuid) to authenticated;

create function app_private.lock_member_change(
  p_clinic_id uuid,
  p_member_id uuid,
  p_permission text
)
returns public.clinic_members
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_member public.clinic_members%rowtype;
begin
  perform 1 from public.clinics as c
  where c.id = p_clinic_id and c.status = 'active' and c.deleted_at is null
  for update;
  if not found or not app_private.has_permission(p_clinic_id, p_permission) then
    raise exception using errcode = '42501', message = 'operation not allowed';
  end if;
  select cm.* into v_member from public.clinic_members as cm
  where cm.id = p_member_id and cm.clinic_id = p_clinic_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'operation not allowed';
  end if;
  return v_member;
end;
$$;
alter function app_private.lock_member_change(uuid, uuid, text) owner to postgres;
revoke all on function app_private.lock_member_change(uuid, uuid, text)
  from public, anon, authenticated;

create function public.update_member_role(
  clinic_id uuid,
  member_id uuid,
  target_role text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_member public.clinic_members;
  v_actor_role text;
begin
  perform app_private.require_aal2();
  v_member := app_private.lock_member_change(clinic_id, member_id, 'member.manage');
  if target_role = 'owner'
    or not app_private.can_assign_role(clinic_id, target_role)
  then
    raise exception using errcode = '42501', message = 'operation not allowed';
  end if;
  select cm.role into v_actor_role from public.clinic_members as cm
  where cm.clinic_id = clinic_id and cm.user_id = (select auth.uid())
    and cm.status = 'active';
  if v_member.role = 'owner' and v_actor_role <> 'owner' then
    raise exception using errcode = '42501', message = 'operation not allowed';
  end if;
  if v_member.role = 'owner' and (
    select count(*) from public.clinic_members as cm
    where cm.clinic_id = clinic_id and cm.role = 'owner' and cm.status = 'active'
  ) <= 1 then
    raise exception using errcode = '23514', message = 'active owner required';
  end if;
  update public.clinic_members as cm set role = target_role where cm.id = member_id;
  perform app_private.log_audit_event(
    clinic_id, 'member.role_updated', 'clinic_member', member_id,
    jsonb_build_object('role', v_member.role),
    jsonb_build_object('role', target_role), null
  );
  return true;
end;
$$;
alter function public.update_member_role(uuid, uuid, text) owner to postgres;
revoke all on function public.update_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.update_member_role(uuid, uuid, text) to authenticated;

create function public.suspend_member(clinic_id uuid, member_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare v_member public.clinic_members;
begin
  perform app_private.require_aal2();
  v_member := app_private.lock_member_change(clinic_id, member_id, 'member.manage');
  if v_member.role = 'owner' and not exists (
    select 1 from public.clinic_members as actor
    where actor.clinic_id = clinic_id
      and actor.user_id = (select auth.uid())
      and actor.role = 'owner'
      and actor.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'operation not allowed';
  end if;
  if v_member.role = 'owner' and (
    select count(*) from public.clinic_members as cm
    where cm.clinic_id = clinic_id and cm.role = 'owner' and cm.status = 'active'
  ) <= 1 then
    raise exception using errcode = '23514', message = 'active owner required';
  end if;
  update public.clinic_members as cm set status = 'suspended' where cm.id = member_id;
  perform app_private.log_audit_event(
    clinic_id, 'member.suspended', 'clinic_member', member_id,
    jsonb_build_object('status', v_member.status),
    jsonb_build_object('status', 'suspended'), null
  );
  return true;
end;
$$;
alter function public.suspend_member(uuid, uuid) owner to postgres;
revoke all on function public.suspend_member(uuid, uuid) from public, anon;
grant execute on function public.suspend_member(uuid, uuid) to authenticated;

create function public.remove_member(clinic_id uuid, member_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare v_member public.clinic_members;
begin
  perform app_private.require_aal2();
  v_member := app_private.lock_member_change(clinic_id, member_id, 'member.remove');
  if v_member.role = 'owner' and (
    select count(*) from public.clinic_members as cm
    where cm.clinic_id = clinic_id and cm.role = 'owner' and cm.status = 'active'
  ) <= 1 then
    raise exception using errcode = '23514', message = 'active owner required';
  end if;
  delete from public.clinic_members as cm where cm.id = member_id;
  perform app_private.log_audit_event(
    clinic_id, 'member.removed', 'clinic_member', member_id,
    jsonb_build_object('role', v_member.role, 'status', v_member.status),
    null, null
  );
  return true;
end;
$$;
alter function public.remove_member(uuid, uuid) owner to postgres;
revoke all on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
