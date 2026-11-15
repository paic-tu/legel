-- SQL Editor fallback after both migrations and inviting this account.
-- The automated team provisioner also performs this binding.
select public.legal_provision_employee(
  'manager',
  'مدير الإدارة القانونية',
  'مدير الإدارة القانونية',
  'legal.manager@thabat.sa'
);
