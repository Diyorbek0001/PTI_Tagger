create table public.pti_notifications (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id),
  registration_id uuid not null references public.unit_registrations(id),
  telegram_chat_id bigint not null,
  telegram_message_id bigint not null,
  notification_type text not null check (notification_type in ('manual', 'automatic')),
  sent_by text,
  sent_at timestamptz not null default now()
);

create index pti_notifications_unit_sent_idx
  on public.pti_notifications(unit_id, sent_at desc);

create index pti_notifications_registration_sent_idx
  on public.pti_notifications(registration_id, sent_at desc);
