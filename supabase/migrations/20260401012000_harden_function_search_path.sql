create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.generate_share_slug()
returns text
language sql
set search_path = public
as $$
  select lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
$$;
