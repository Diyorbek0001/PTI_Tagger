-- The application supplies a Monday date calculated in PTI_TIME_ZONE. Keep it when present;
-- direct SQL inserts still receive a safe database-side default.
create or replace function public.pti_driver_snapshot_trigger() returns trigger language plpgsql set search_path=public as $$
declare r unit_registrations%rowtype;
begin
  select * into r from unit_registrations where id=new.registration_id;
  new.driver_id := r.driver_id;
  new.driver_username_snapshot := r.driver_username;
  new.driver_name_snapshot := nullif(btrim(concat_ws(' ', r.driver_first_name, r.driver_last_name)), '');
  new.compliance_week_start := coalesce(new.compliance_week_start,
    (date_trunc('week', new.created_at at time zone coalesce(nullif(current_setting('app.pti_time_zone', true), ''), 'America/New_York')))::date);
  return new;
end $$;
