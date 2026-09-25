create extension if not exists pgcrypto;

create type public.registration_status as enum ('registered', 'not_registered');
create table public.units (
  id uuid primary key default gen_random_uuid(), unit_number text not null unique check (unit_number ~ '^[A-Za-z0-9-]+$'),
  company text not null check (length(btrim(company)) between 1 and 120),
  registration_status public.registration_status not null default 'not_registered', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index units_company_idx on public.units(company);
create table public.unit_registrations (
  id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.units(id), telegram_chat_id bigint not null, telegram_chat_title text not null, telegram_chat_type text not null check (telegram_chat_type in ('group','supergroup')),
  driver_telegram_user_id bigint, driver_username text, driver_first_name text, driver_last_name text, registered_at timestamptz not null default now(), registered_by_telegram_user_id bigint not null,
  check (driver_telegram_user_id is not null or driver_username is not null),
  is_active boolean not null default true, unregistered_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((is_active and unregistered_at is null) or (not is_active and unregistered_at is not null))
);
create unique index one_active_registration_per_unit on public.unit_registrations(unit_id) where is_active;
create unique index one_active_registration_per_group on public.unit_registrations(telegram_chat_id) where is_active;
create index unit_registrations_history_idx on public.unit_registrations(unit_id, registered_at desc);
create table public.unit_authorization_codes (
  id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.units(id), code_hash text not null, expires_at timestamptz not null, used_at timestamptz, revoked_at timestamptz,
  created_at timestamptz not null default now(), created_by text, check (expires_at > created_at)
);
create unique index one_usable_code_per_unit on public.unit_authorization_codes(unit_id) where used_at is null and revoked_at is null;
create index authorization_code_lookup on public.unit_authorization_codes(code_hash);
create table public.registration_audit_log (
  id uuid primary key default gen_random_uuid(), unit_id uuid references public.units(id), event_type text not null check (event_type in ('authorization_code_generated','authorization_code_expired','authorization_code_revoked','authorization_code_used','unit_registered','unit_unregistered','registration_failed')),
  telegram_chat_id bigint, telegram_user_id bigint, performed_by text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index audit_unit_created_idx on public.registration_audit_log(unit_id, created_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger units_updated_at before update on public.units for each row execute function public.set_updated_at();
create trigger registrations_updated_at before update on public.unit_registrations for each row execute function public.set_updated_at();

-- Server-only RPC: execution is revoked from browser roles below. It locks a unit's active code,
-- so two competing activations cannot both succeed.
create or replace function public.issue_unit_authorization_code(p_unit_id uuid, p_code text, p_expires_at timestamptz, p_created_by text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; begin
  if p_code !~ '^\d{6}$' then raise exception 'Authorization code must contain exactly six digits'; end if;
  perform 1 from units where id = p_unit_id and registration_status = 'not_registered' for update;
  if not found then raise exception 'Unit is already registered or does not exist'; end if;
  update unit_authorization_codes set revoked_at = now() where unit_id=p_unit_id and used_at is null and revoked_at is null;
  insert into unit_authorization_codes(unit_id, code_hash, expires_at, created_by) values (p_unit_id, crypt(p_code, gen_salt('bf')), p_expires_at, p_created_by) returning id into v_id;
  insert into registration_audit_log(unit_id,event_type,performed_by,metadata) values(p_unit_id,'authorization_code_generated',p_created_by::text,jsonb_build_object('expires_at',p_expires_at));
  return v_id;
end; $$;

create or replace function public.activate_unit_registration(p_code text, p_chat_id bigint, p_chat_title text, p_chat_type text, p_driver_id bigint, p_driver_username text, p_driver_first_name text, p_driver_last_name text, p_performed_by text) returns table(unit_number text)
language plpgsql security definer set search_path = public, extensions as $$
declare c unit_authorization_codes%rowtype; u units%rowtype; begin
  select * into c from unit_authorization_codes where code_hash = crypt(p_code, code_hash) order by created_at desc limit 1 for update;
  if not found then raise exception 'Invalid authorization code.'; end if;
  if c.used_at is not null then raise exception 'This authorization code has already been used.'; end if;
  if c.revoked_at is not null then raise exception 'Invalid authorization code.'; end if;
  if c.expires_at <= now() then update unit_authorization_codes set revoked_at=now() where id=c.id; insert into registration_audit_log(unit_id,event_type,metadata) values(c.unit_id,'authorization_code_expired','{}'); raise exception 'This authorization code has expired. Generate a new code from the website.'; end if;
  select * into u from units where id=c.unit_id for update;
  if u.registration_status <> 'not_registered' then raise exception 'Unit % is already registered. Unregister it from the website before registering another group.', u.unit_number; end if;
  if exists(select 1 from unit_registrations where telegram_chat_id=p_chat_id and is_active) then raise exception 'This Telegram group is already registered to another unit.'; end if;
  insert into unit_registrations(unit_id,telegram_chat_id,telegram_chat_title,telegram_chat_type,driver_telegram_user_id,driver_username,driver_first_name,driver_last_name,registered_by_telegram_user_id) values(c.unit_id,p_chat_id,p_chat_title,p_chat_type,p_driver_id,p_driver_username,p_driver_first_name,p_driver_last_name,p_performed_by::bigint);
  update unit_authorization_codes set used_at=now() where id=c.id; update units set registration_status='registered' where id=c.unit_id;
  insert into registration_audit_log(unit_id,event_type,telegram_chat_id,telegram_user_id,performed_by,metadata) values(c.unit_id,'authorization_code_used',p_chat_id,p_driver_id,p_performed_by,'{}'),(c.unit_id,'unit_registered',p_chat_id,p_driver_id,p_performed_by,jsonb_build_object('chat_title',p_chat_title));
  return query select u.unit_number;
exception when unique_violation then raise exception 'This unit or Telegram group was registered concurrently. Please refresh and try again.'; end; $$;

create or replace function public.unregister_unit(p_unit_id uuid, p_performed_by text) returns void language plpgsql security definer set search_path = public as $$
declare r unit_registrations%rowtype; begin select * into r from unit_registrations where unit_id=p_unit_id and is_active for update; if not found then raise exception 'Unit is not registered'; end if; update unit_registrations set is_active=false,unregistered_at=now() where id=r.id; update units set registration_status='not_registered' where id=p_unit_id; insert into registration_audit_log(unit_id,event_type,telegram_chat_id,telegram_user_id,performed_by) values(p_unit_id,'unit_unregistered',r.telegram_chat_id,r.driver_telegram_user_id,p_performed_by::text); end; $$;

-- This direct-PostgreSQL test build has no browser database access. The Next.js
-- server is the only process that connects using DATABASE_URL.
