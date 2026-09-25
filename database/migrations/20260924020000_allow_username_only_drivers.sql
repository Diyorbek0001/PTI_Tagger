alter table public.unit_registrations
  alter column driver_telegram_user_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'unit_registrations_driver_identity_required'
      and conrelid = 'public.unit_registrations'::regclass
  ) then
    alter table public.unit_registrations
      add constraint unit_registrations_driver_identity_required
      check (driver_telegram_user_id is not null or driver_username is not null);
  end if;
end $$;
