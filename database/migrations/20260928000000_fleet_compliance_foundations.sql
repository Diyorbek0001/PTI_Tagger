-- Fleet history, defects, compliance exclusions, and central audit foundations.
-- This migration is additive and backfills only from timestamps/identity already stored.

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint unique,
  telegram_username text,
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (telegram_user_id is not null or telegram_username is not null)
);
create index if not exists drivers_username_idx on public.drivers(lower(telegram_username));
create trigger drivers_updated_at before update on public.drivers
for each row execute function public.set_updated_at();

alter table public.unit_registrations add column if not exists driver_id uuid references public.drivers(id);
create index if not exists unit_registrations_driver_idx on public.unit_registrations(driver_id, registered_at desc);

-- Prefer Telegram's immutable numeric id. Username-only identities are matched case-insensitively.
insert into public.drivers(telegram_user_id, telegram_username, first_name, last_name, created_at)
select distinct on (driver_telegram_user_id)
  driver_telegram_user_id, nullif(regexp_replace(driver_username, '^@', ''), ''),
  driver_first_name, driver_last_name, registered_at
from public.unit_registrations
where driver_telegram_user_id is not null
order by driver_telegram_user_id, registered_at desc
on conflict (telegram_user_id) do nothing;

insert into public.drivers(telegram_username, first_name, last_name, created_at)
select distinct on (lower(regexp_replace(driver_username, '^@', '')))
  regexp_replace(driver_username, '^@', ''), driver_first_name, driver_last_name, registered_at
from public.unit_registrations r
where driver_telegram_user_id is null and nullif(regexp_replace(driver_username, '^@', ''), '') is not null
  and not exists (
    select 1 from public.drivers d
    where lower(d.telegram_username) = lower(regexp_replace(r.driver_username, '^@', ''))
  )
order by lower(regexp_replace(driver_username, '^@', '')), registered_at desc;

update public.unit_registrations r set driver_id = d.id
from public.drivers d
where r.driver_id is null and (
  (r.driver_telegram_user_id is not null and d.telegram_user_id = r.driver_telegram_user_id)
  or (r.driver_telegram_user_id is null and r.driver_username is not null
      and lower(d.telegram_username) = lower(regexp_replace(r.driver_username, '^@', '')))
);

create table if not exists public.driver_unit_assignments (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id),
  driver_id uuid references public.drivers(id),
  registration_id uuid references public.unit_registrations(id),
  driver_telegram_user_id bigint,
  driver_username text,
  driver_first_name text,
  driver_last_name text,
  telegram_group_id bigint,
  telegram_group_title text,
  started_at timestamptz,
  ended_at timestamptz,
  reason text,
  source text not null check (source in ('TELEGRAM_ACTIVATION','MANUAL_REASSIGNMENT','SYSTEM_MIGRATION','MIGRATION_UNKNOWN_DATE')),
  created_by text,
  created_at timestamptz not null default now(),
  check (ended_at is null or started_at is null or ended_at >= started_at)
);
create unique index if not exists driver_assignments_registration_idx
  on public.driver_unit_assignments(registration_id) where registration_id is not null;
create unique index if not exists one_open_assignment_per_unit
  on public.driver_unit_assignments(unit_id) where ended_at is null;
create index if not exists driver_assignments_unit_dates_idx on public.driver_unit_assignments(unit_id, started_at desc);
create index if not exists driver_assignments_driver_dates_idx on public.driver_unit_assignments(driver_id, started_at desc);

insert into public.driver_unit_assignments(
  unit_id, driver_id, registration_id, driver_telegram_user_id, driver_username,
  driver_first_name, driver_last_name, telegram_group_id, telegram_group_title,
  started_at, ended_at, source, created_by
)
select r.unit_id, r.driver_id, r.id, r.driver_telegram_user_id, r.driver_username,
  r.driver_first_name, r.driver_last_name, r.telegram_chat_id, r.telegram_chat_title,
  r.registered_at, r.unregistered_at,
  'SYSTEM_MIGRATION', 'migration'
from public.unit_registrations r
where not exists (select 1 from public.driver_unit_assignments a where a.registration_id=r.id)
on conflict do nothing;

alter table public.pti_submissions add column if not exists driver_id uuid references public.drivers(id);
alter table public.pti_submissions add column if not exists driver_username_snapshot text;
alter table public.pti_submissions add column if not exists driver_name_snapshot text;
alter table public.pti_submissions add column if not exists compliance_week_start date;
update public.pti_submissions s set
  driver_id = r.driver_id,
  driver_username_snapshot = r.driver_username,
  driver_name_snapshot = nullif(btrim(concat_ws(' ', r.driver_first_name, r.driver_last_name)), ''),
  compliance_week_start = (date_trunc('week', s.created_at at time zone coalesce(current_setting('app.pti_time_zone', true), 'America/New_York')))::date
from public.unit_registrations r where r.id=s.registration_id
  and (s.driver_id is null or s.compliance_week_start is null);
create index if not exists pti_submissions_driver_created_idx on public.pti_submissions(driver_id, created_at desc);
create index if not exists pti_submissions_compliance_week_idx on public.pti_submissions(compliance_week_start, unit_id);

create table if not exists public.defects (
  id uuid primary key default gen_random_uuid(),
  defect_number bigint generated always as identity unique,
  pti_submission_id uuid not null references public.pti_submissions(id),
  unit_id uuid not null references public.units(id),
  driver_id uuid references public.drivers(id),
  driver_name_snapshot text,
  driver_username_snapshot text,
  company_snapshot text not null,
  category text not null check (category in ('Tire','Brake','Light','Air Line','Electrical','Engine','Fluid Leak','Windshield','Mirror','Fifth Wheel','Suspension','Mudflap','Trailer','Body Damage','Safety Equipment','Registration / Plate','Other')),
  description text not null check (length(btrim(description)) between 1 and 4000),
  severity text not null check (severity in ('MINOR','ATTENTION','CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN','ASSIGNED','REPAIR_SCHEDULED','IN_REPAIR','RESOLVED','CANCELLED')),
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by text not null,
  assigned_to text,
  resolved_at timestamptz,
  resolved_by text,
  resolution_notes text,
  updated_at timestamptz not null default now(),
  check ((status = 'RESOLVED' and resolved_at is not null) or status <> 'RESOLVED')
);
create trigger defects_updated_at before update on public.defects
for each row execute function public.set_updated_at();
create index if not exists defects_unit_category_date_idx on public.defects(unit_id, category, detected_at desc);
create index if not exists defects_driver_date_idx on public.defects(driver_id, detected_at desc);
create index if not exists defects_status_idx on public.defects(status, created_at desc);
create index if not exists defects_severity_idx on public.defects(severity, created_at desc);
create index if not exists defects_pti_idx on public.defects(pti_submission_id);

create table if not exists public.pti_compliance_exclusions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id),
  driver_id uuid references public.drivers(id),
  week_start date not null,
  reason text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique(unit_id, week_start)
);
create index if not exists compliance_exclusions_driver_week_idx on public.pti_compliance_exclusions(driver_id, week_start desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('WEB_USER','TELEGRAM_USER','SYSTEM','BOT')),
  actor_id text,
  actor_display_name text,
  action text not null,
  entity_type text not null,
  entity_id text,
  unit_id uuid references public.units(id),
  driver_id uuid references public.drivers(id),
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);
create index if not exists audit_entity_date_idx on public.audit_logs(entity_type, entity_id, occurred_at desc);
create index if not exists audit_actor_date_idx on public.audit_logs(actor_type, actor_id, occurred_at desc);
create index if not exists audit_action_date_idx on public.audit_logs(action, occurred_at desc);
create index if not exists audit_unit_date_idx on public.audit_logs(unit_id, occurred_at desc);
create index if not exists audit_driver_date_idx on public.audit_logs(driver_id, occurred_at desc);

create or replace function public.resolve_or_create_driver(
  p_telegram_user_id bigint, p_username text, p_first_name text, p_last_name text
) returns uuid language plpgsql set search_path=public as $$
declare v_id uuid; v_username text := nullif(regexp_replace(p_username, '^@', ''), '');
begin
  if p_telegram_user_id is not null then
    insert into drivers(telegram_user_id, telegram_username, first_name, last_name)
    values(p_telegram_user_id, v_username, p_first_name, p_last_name)
    on conflict (telegram_user_id) do update set
      telegram_username=coalesce(excluded.telegram_username, drivers.telegram_username),
      first_name=coalesce(excluded.first_name, drivers.first_name),
      last_name=coalesce(excluded.last_name, drivers.last_name)
    returning id into v_id;
  else
    select id into v_id from drivers where lower(telegram_username)=lower(v_username) order by created_at limit 1;
    if v_id is null then
      insert into drivers(telegram_username, first_name, last_name)
      values(v_username, p_first_name, p_last_name) returning id into v_id;
    end if;
  end if;
  return v_id;
end $$;

create or replace function public.registration_driver_history_trigger() returns trigger language plpgsql set search_path=public as $$
begin
  new.driver_id := resolve_or_create_driver(new.driver_telegram_user_id, new.driver_username, new.driver_first_name, new.driver_last_name);
  return new;
end $$;
drop trigger if exists registration_resolve_driver on public.unit_registrations;
create trigger registration_resolve_driver before insert on public.unit_registrations
for each row execute function public.registration_driver_history_trigger();

create or replace function public.registration_assignment_trigger() returns trigger language plpgsql set search_path=public as $$
begin
  insert into driver_unit_assignments(unit_id,driver_id,registration_id,driver_telegram_user_id,driver_username,driver_first_name,driver_last_name,telegram_group_id,telegram_group_title,started_at,source,created_by)
  values(new.unit_id,new.driver_id,new.id,new.driver_telegram_user_id,new.driver_username,new.driver_first_name,new.driver_last_name,new.telegram_chat_id,new.telegram_chat_title,new.registered_at,'TELEGRAM_ACTIVATION',new.registered_by_telegram_user_id::text);
  return new;
end $$;
drop trigger if exists registration_create_assignment on public.unit_registrations;
create trigger registration_create_assignment after insert on public.unit_registrations
for each row execute function public.registration_assignment_trigger();

create or replace function public.registration_close_assignment_trigger() returns trigger language plpgsql set search_path=public as $$
begin
  if old.is_active and not new.is_active then
    update driver_unit_assignments set ended_at=coalesce(new.unregistered_at, now()), reason=coalesce(reason, 'Unit unregistered')
    where registration_id=new.id and ended_at is null;
  end if;
  return new;
end $$;
drop trigger if exists registration_close_assignment on public.unit_registrations;
create trigger registration_close_assignment after update of is_active on public.unit_registrations
for each row execute function public.registration_close_assignment_trigger();

create or replace function public.pti_driver_snapshot_trigger() returns trigger language plpgsql set search_path=public as $$
declare r unit_registrations%rowtype;
begin
  select * into r from unit_registrations where id=new.registration_id;
  new.driver_id := r.driver_id;
  new.driver_username_snapshot := r.driver_username;
  new.driver_name_snapshot := nullif(btrim(concat_ws(' ', r.driver_first_name, r.driver_last_name)), '');
  new.compliance_week_start := (date_trunc('week', new.created_at at time zone coalesce(current_setting('app.pti_time_zone', true), 'America/New_York')))::date;
  return new;
end $$;
drop trigger if exists pti_capture_driver_snapshot on public.pti_submissions;
create trigger pti_capture_driver_snapshot before insert on public.pti_submissions
for each row execute function public.pti_driver_snapshot_trigger();
