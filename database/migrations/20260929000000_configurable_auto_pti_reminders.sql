-- Automatic reminders are explicitly enabled per unit. This prevents a new
-- scheduler deployment from unexpectedly messaging every registered driver.
alter table public.units
  add column if not exists auto_reminders_enabled boolean not null default false;

alter table public.pti_reminder_settings
  add column if not exists auto_reminder_interval_days integer not null default 2
    check (auto_reminder_interval_days between 1 and 14);

create index if not exists pti_notifications_registration_sent_idx
  on public.pti_notifications(registration_id, sent_at desc);
