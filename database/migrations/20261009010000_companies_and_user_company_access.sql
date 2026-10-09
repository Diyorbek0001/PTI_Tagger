create table public.companies (
  name text primary key check (length(btrim(name)) between 1 and 120),
  is_active boolean not null default true,
  created_by uuid references public.web_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.companies(name)
select distinct company from public.units where nullif(btrim(company), '') is not null
on conflict (name) do nothing;

create trigger companies_updated_at before update on public.companies
for each row execute function public.set_updated_at();

create table public.web_user_company_access (
  user_id uuid not null references public.web_users(id) on delete cascade,
  company_name text not null references public.companies(name) on update cascade on delete cascade,
  can_view boolean not null default false,
  can_edit boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(user_id, company_name),
  check (not can_edit or can_view)
);

-- Preserve current access for existing accounts while making access explicit for
-- accounts created after this migration.
insert into public.web_user_company_access(user_id, company_name, can_view, can_edit)
select u.id, c.name, true, u.role in ('ADMIN','SUPERADMIN')
from public.web_users u cross join public.companies c
on conflict (user_id, company_name) do nothing;

alter table public.web_users drop constraint if exists web_users_role_check;
alter table public.web_users add constraint web_users_role_check
  check (role in ('VIEWER','ADMIN','SUPERADMIN','USERADMIN'));
