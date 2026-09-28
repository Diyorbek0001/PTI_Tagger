create table if not exists public.web_users (
  id uuid primary key default gen_random_uuid(),
  username text not null check (username ~ '^[A-Za-z0-9._-]{3,64}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  password_hash text not null,
  role text not null check (role in ('VIEWER','ADMIN','SUPERADMIN')),
  is_active boolean not null default true,
  session_version integer not null default 1 check (session_version > 0),
  last_login_at timestamptz,
  password_changed_at timestamptz not null default now(),
  created_by uuid references public.web_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists web_users_username_unique_idx on public.web_users(lower(username));
create index if not exists web_users_role_active_idx on public.web_users(role,is_active);
create trigger web_users_updated_at before update on public.web_users
for each row execute function public.set_updated_at();
