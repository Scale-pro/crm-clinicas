-- F4 — catálogo de autorização da agenda.
--
-- `appointment.manage` cobre marcar, remarcar e mudar status (inclusive
-- registrar chegada e pagamento na recepção). Perfis clínicos e de leitura
-- enxergam a agenda, mas não a alteram.

insert into public.permissions (key) values
  ('appointment.view'),
  ('appointment.manage');

insert into public.role_permissions (role, permission) values
  ('owner', 'appointment.view'),
  ('owner', 'appointment.manage'),
  ('admin', 'appointment.view'),
  ('admin', 'appointment.manage'),
  ('manager', 'appointment.view'),
  ('manager', 'appointment.manage'),
  ('receptionist', 'appointment.view'),
  ('receptionist', 'appointment.manage'),
  ('sdr', 'appointment.view'),
  ('sdr', 'appointment.manage'),
  ('professional', 'appointment.view'),
  ('viewer', 'appointment.view');
