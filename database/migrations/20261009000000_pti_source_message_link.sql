alter table public.pti_submissions
  add column if not exists source_message_link text not null default 'N/A';
