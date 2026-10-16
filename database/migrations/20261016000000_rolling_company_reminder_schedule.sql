alter table public.pti_reminder_settings
  add column if not exists auto_reminder_time time not null default time '09:00';
