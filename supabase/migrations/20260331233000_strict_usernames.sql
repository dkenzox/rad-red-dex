create or replace function public.is_username_available(candidate_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.profiles
    where username = lower(candidate_username)::citext
  );
$$;

grant execute on function public.is_username_available(text) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text;
  requested_display_name text;
begin
  requested_username := lower(
    regexp_replace(
      coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'trainer'),
      '[^a-zA-Z0-9_]+',
      '',
      'g'
    )
  );

  requested_display_name := coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    requested_username
  );

  if requested_username is null or char_length(requested_username) < 3 or char_length(requested_username) > 24 then
    raise exception 'Username must be 3-24 characters and use only lowercase letters, numbers, or underscores.';
  end if;

  if exists (
    select 1
    from public.profiles
    where username = requested_username::citext
  ) then
    raise exception 'Username is already taken.';
  end if;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    requested_username,
    requested_display_name
  );

  return new;
end;
$$;
