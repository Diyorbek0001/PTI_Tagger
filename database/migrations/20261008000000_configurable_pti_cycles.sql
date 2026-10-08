alter table public.pti_reminder_settings
  add column if not exists pti_cycle_days integer not null default 7
    check (pti_cycle_days between 1 and 31),
  add column if not exists pti_cycle_anchor_date date not null default date '2026-10-05';
