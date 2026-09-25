alter table public.pti_submissions
  add column if not exists pti_number bigint generated always as identity;

create unique index if not exists pti_submissions_pti_number_idx
  on public.pti_submissions(pti_number);
