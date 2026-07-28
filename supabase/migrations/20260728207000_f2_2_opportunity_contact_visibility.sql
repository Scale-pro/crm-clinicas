-- F2.2 review fix — a visible opportunity also grants read-only contact visibility.

drop policy contacts_select on public.contacts;
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
    or exists (
      select 1
      from public.opportunities as visible_opportunity
      where visible_opportunity.clinic_id = contacts.clinic_id
        and visible_opportunity.contact_id = contacts.id
    )
  )
);
