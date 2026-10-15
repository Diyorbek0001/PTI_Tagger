-- Keep the existing settings as the template for every company, then make
-- company the scope of operational PTI settings.
create temporary table pti_reminder_settings_template as select * from public.pti_reminder_settings where singleton=true;
alter table public.pti_reminder_settings add column if not exists company_name text;
alter table public.pti_reminder_settings drop constraint if exists pti_reminder_settings_singleton_check;
alter table public.pti_reminder_settings drop constraint if exists pti_reminder_settings_pkey;
alter table public.pti_reminder_settings drop column if exists singleton;
delete from public.pti_reminder_settings;

insert into public.pti_reminder_settings
  (company_name, message_template, media_type, telegram_file_id, updated_by,
   auto_reminder_interval_days, pti_cycle_days, pti_cycle_anchor_date)
select c.name, s.message_template, s.media_type, s.telegram_file_id, s.updated_by,
       s.auto_reminder_interval_days, s.pti_cycle_days, s.pti_cycle_anchor_date
from public.companies c
cross join (select * from pti_reminder_settings_template limit 1) s
on conflict do nothing;

alter table public.pti_reminder_settings alter column company_name set not null;
alter table public.pti_reminder_settings add primary key (company_name);
