alter table public.units add column if not exists company text;

update public.units
set company = 'Unassigned'
where company is null or btrim(company) = '';

alter table public.units alter column company set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'units_company_not_blank'
      and conrelid = 'public.units'::regclass
  ) then
    alter table public.units
      add constraint units_company_not_blank
      check (length(btrim(company)) between 1 and 120);
  end if;
end $$;

create index if not exists units_company_idx on public.units(company);
