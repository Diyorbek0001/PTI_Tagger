create table public.pti_submissions (
  id uuid primary key default gen_random_uuid(),
  pti_number bigint generated always as identity unique,
  unit_id uuid not null references public.units(id),
  registration_id uuid not null references public.unit_registrations(id),
  source_chat_id bigint not null,
  source_chat_title text not null,
  source_message_id bigint not null,
  submitted_by_user_id bigint,
  submitted_by_username text,
  media_type text not null check (media_type in ('photo', 'video')),
  telegram_file_id text not null,
  archive_chat_id bigint not null,
  archive_message_id bigint,
  status text not null default 'processing' check (status in ('processing', 'pending_review', 'approved', 'resend_requested', 'resubmitted', 'failed')),
  review_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  resend_requested_at timestamptz,
  resubmission_for_id uuid references public.pti_submissions(id),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_chat_id, source_message_id)
);

create index pti_submissions_status_created_idx on public.pti_submissions(status, created_at desc);
create index pti_submissions_unit_created_idx on public.pti_submissions(unit_id, created_at desc);
create index pti_submissions_registration_idx on public.pti_submissions(registration_id);
create index pti_submissions_resubmission_idx on public.pti_submissions(resubmission_for_id) where resubmission_for_id is not null;

create trigger pti_submissions_updated_at
before update on public.pti_submissions
for each row execute function public.set_updated_at();
