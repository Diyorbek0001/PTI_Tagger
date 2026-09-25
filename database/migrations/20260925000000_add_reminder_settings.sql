create table public.pti_reminder_settings (
  singleton boolean primary key default true check (singleton),
  message_template text not null check (length(message_template) between 1 and 900),
  media_type text check (media_type in ('photo', 'video')),
  telegram_file_id text,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  check ((media_type is null and telegram_file_id is null) or (media_type is not null and telegram_file_id is not null))
);
