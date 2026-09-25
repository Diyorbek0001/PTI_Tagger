-- Replace these development rows with your real fleet list before deployment.
insert into public.units (unit_number, company) values
  ('6301', 'PTI'),
  ('6302', 'PTI'),
  ('6303', 'PTI'),
  ('6304', 'PTI'),
  ('6305', 'PTI')
on conflict (unit_number) do nothing;
