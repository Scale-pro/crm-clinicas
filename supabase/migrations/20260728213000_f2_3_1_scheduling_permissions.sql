-- F2.3.1 — catálogo de autorização da operação clínica.

insert into public.permissions (key) values
  ('professional.view'),
  ('professional.manage'),
  ('procedure.view'),
  ('procedure.manage');

insert into public.role_permissions (role, permission) values
  ('owner', 'professional.view'),
  ('owner', 'professional.manage'),
  ('owner', 'procedure.view'),
  ('owner', 'procedure.manage'),
  ('admin', 'professional.view'),
  ('admin', 'professional.manage'),
  ('admin', 'procedure.view'),
  ('admin', 'procedure.manage'),
  ('manager', 'professional.view'),
  ('manager', 'professional.manage'),
  ('manager', 'procedure.view'),
  ('manager', 'procedure.manage'),
  ('receptionist', 'professional.view'),
  ('receptionist', 'procedure.view'),
  ('professional', 'professional.view'),
  ('professional', 'procedure.view'),
  ('viewer', 'professional.view'),
  ('viewer', 'procedure.view');
