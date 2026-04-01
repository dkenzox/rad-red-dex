create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.team_visibility as enum ('private', 'unlisted', 'public');
create type public.favorite_visibility as enum ('private', 'public');
create type public.import_container_type as enum ('party', 'box');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.generate_share_slug()
returns text
language sql
as $$
  select lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
$$;

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

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext not null unique,
  display_name text,
  avatar_url text,
  bio text,
  is_public boolean not null default true,
  favorites_are_public boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_username_format
    check (username ~ '^[a-z0-9_]{3,24}$')
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  visibility public.team_visibility not null default 'private',
  share_slug text not null unique default public.generate_share_slug(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  published_at timestamptz,
  constraint teams_name_length check (char_length(name) between 1 and 80),
  constraint teams_share_slug_format check (share_slug ~ '^[a-z0-9]{10,32}$')
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  slot smallint not null,
  species_id integer not null,
  nickname text,
  ability_id integer,
  item_id integer,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint team_members_slot_range check (slot between 1 and 6),
  constraint team_members_unique_slot unique (team_id, slot)
);

create table public.team_member_moves (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members (id) on delete cascade,
  slot smallint not null,
  move_id integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint team_member_moves_slot_range check (slot between 1 and 4),
  constraint team_member_moves_unique_slot unique (team_member_id, slot)
);

create table public.favorite_species (
  user_id uuid not null references public.profiles (id) on delete cascade,
  species_id integer not null,
  visibility public.favorite_visibility not null default 'private',
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, species_id)
);

create table public.save_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  filename text,
  trainer_name text not null,
  trainer_id bigint not null,
  restricted boolean not null default false,
  hardmode boolean not null default false,
  random_abilities boolean not null default false,
  random_learnset boolean not null default false,
  random_normal_species boolean not null default false,
  random_scaled_species boolean not null default false,
  parser_version text not null default 'v1',
  created_at timestamptz not null default timezone('utc', now())
);

create table public.imported_pokemon (
  id uuid primary key default gen_random_uuid(),
  save_import_id uuid not null references public.save_imports (id) on delete cascade,
  container_type public.import_container_type not null,
  container_index integer not null default 0,
  slot_index integer not null,
  species_id integer,
  nickname text,
  level integer,
  met_location_id integer,
  met_level integer,
  met_game integer,
  ability_id integer,
  ability_slot integer,
  held_item_id integer,
  nature_id integer,
  is_shiny boolean,
  personality bigint,
  ot_id bigint,
  raw_data jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint imported_pokemon_slot_non_negative check (slot_index >= 0)
);

create table public.imported_pokemon_moves (
  imported_pokemon_id uuid not null references public.imported_pokemon (id) on delete cascade,
  slot smallint not null,
  move_id integer not null,
  primary key (imported_pokemon_id, slot),
  constraint imported_pokemon_moves_slot_range check (slot between 1 and 4)
);

create or replace function public.is_team_owner(team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams
    where id = team_id
      and owner_id = auth.uid()
  );
$$;

create index teams_owner_id_idx on public.teams (owner_id, updated_at desc);
create index teams_visibility_idx on public.teams (visibility, published_at desc nulls last);
create index team_members_team_id_idx on public.team_members (team_id);
create index favorite_species_visibility_idx on public.favorite_species (visibility, created_at desc);
create index save_imports_user_id_idx on public.save_imports (user_id, created_at desc);
create index imported_pokemon_save_import_id_idx on public.imported_pokemon (save_import_id, container_type, container_index, slot_index);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger teams_set_updated_at
before update on public.teams
for each row execute function public.set_updated_at();

create trigger team_members_set_updated_at
before update on public.team_members
for each row execute function public.set_updated_at();

create trigger favorite_species_set_updated_at
before update on public.favorite_species
for each row execute function public.set_updated_at();

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_member_moves enable row level security;
alter table public.favorite_species enable row level security;
alter table public.save_imports enable row level security;
alter table public.imported_pokemon enable row level security;
alter table public.imported_pokemon_moves enable row level security;

grant usage on schema public to anon, authenticated;
grant execute on function public.is_username_available(text) to anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant select on public.teams to anon, authenticated;
grant select on public.team_members to anon, authenticated;
grant select on public.team_member_moves to anon, authenticated;
grant select on public.favorite_species to anon, authenticated;

grant insert, update, delete on public.profiles to authenticated;
grant insert, update, delete on public.teams to authenticated;
grant insert, update, delete on public.team_members to authenticated;
grant insert, update, delete on public.team_member_moves to authenticated;
grant insert, update, delete on public.favorite_species to authenticated;
grant select, insert, update, delete on public.save_imports to authenticated;
grant select, insert, update, delete on public.imported_pokemon to authenticated;
grant select, insert, update, delete on public.imported_pokemon_moves to authenticated;

create policy "profiles are readable by owner"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "profiles are readable when public"
on public.profiles
for select
to anon, authenticated
using (is_public = true);

create policy "profiles can be inserted by owner"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "profiles can be updated by owner"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "teams are readable by owner"
on public.teams
for select
to authenticated
using (owner_id = auth.uid());

create policy "public teams are readable by everyone"
on public.teams
for select
to anon, authenticated
using (visibility = 'public');

create policy "teams can be inserted by owner"
on public.teams
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "teams can be updated by owner"
on public.teams
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "teams can be deleted by owner"
on public.teams
for delete
to authenticated
using (owner_id = auth.uid());

create policy "team members are readable by team owner"
on public.team_members
for select
to authenticated
using (public.is_team_owner(team_id));

create policy "team members are readable for public teams"
on public.team_members
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.teams
    where id = team_id
      and visibility = 'public'
  )
);

create policy "team members can be inserted by team owner"
on public.team_members
for insert
to authenticated
with check (public.is_team_owner(team_id));

create policy "team members can be updated by team owner"
on public.team_members
for update
to authenticated
using (public.is_team_owner(team_id))
with check (public.is_team_owner(team_id));

create policy "team members can be deleted by team owner"
on public.team_members
for delete
to authenticated
using (public.is_team_owner(team_id));

create policy "team member moves are readable by team owner"
on public.team_member_moves
for select
to authenticated
using (
  exists (
    select 1
    from public.team_members tm
    where tm.id = team_member_id
      and public.is_team_owner(tm.team_id)
  )
);

create policy "team member moves are readable for public teams"
on public.team_member_moves
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.id = team_member_id
      and t.visibility = 'public'
  )
);

create policy "team member moves can be inserted by team owner"
on public.team_member_moves
for insert
to authenticated
with check (
  exists (
    select 1
    from public.team_members tm
    where tm.id = team_member_id
      and public.is_team_owner(tm.team_id)
  )
);

create policy "team member moves can be updated by team owner"
on public.team_member_moves
for update
to authenticated
using (
  exists (
    select 1
    from public.team_members tm
    where tm.id = team_member_id
      and public.is_team_owner(tm.team_id)
  )
)
with check (
  exists (
    select 1
    from public.team_members tm
    where tm.id = team_member_id
      and public.is_team_owner(tm.team_id)
  )
);

create policy "team member moves can be deleted by team owner"
on public.team_member_moves
for delete
to authenticated
using (
  exists (
    select 1
    from public.team_members tm
    where tm.id = team_member_id
      and public.is_team_owner(tm.team_id)
  )
);

create policy "favorite species are readable by owner"
on public.favorite_species
for select
to authenticated
using (user_id = auth.uid());

create policy "favorite species are readable when public"
on public.favorite_species
for select
to anon, authenticated
using (visibility = 'public');

create policy "favorite species can be inserted by owner"
on public.favorite_species
for insert
to authenticated
with check (user_id = auth.uid());

create policy "favorite species can be updated by owner"
on public.favorite_species
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "favorite species can be deleted by owner"
on public.favorite_species
for delete
to authenticated
using (user_id = auth.uid());

create policy "save imports are owner only"
on public.save_imports
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "imported pokemon are owner only"
on public.imported_pokemon
for all
to authenticated
using (
  exists (
    select 1
    from public.save_imports si
    where si.id = save_import_id
      and si.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.save_imports si
    where si.id = save_import_id
      and si.user_id = auth.uid()
  )
);

create policy "imported pokemon moves are owner only"
on public.imported_pokemon_moves
for all
to authenticated
using (
  exists (
    select 1
    from public.imported_pokemon ip
    join public.save_imports si on si.id = ip.save_import_id
    where ip.id = imported_pokemon_id
      and si.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.imported_pokemon ip
    join public.save_imports si on si.id = ip.save_import_id
    where ip.id = imported_pokemon_id
      and si.user_id = auth.uid()
  )
);

create or replace function public.get_shared_team(team_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with shared_team as (
    select
      t.id,
      t.name,
      t.description,
      t.visibility,
      t.share_slug,
      t.updated_at,
      p.username,
      p.display_name
    from public.teams t
    join public.profiles p on p.id = t.owner_id
    where t.share_slug = team_slug
      and t.visibility in ('public', 'unlisted')
      and p.is_public = true
    limit 1
  )
  select
    case
      when not exists (select 1 from shared_team) then null
      else jsonb_build_object(
        'team', (
          select to_jsonb(st)
          from shared_team st
        ),
        'members', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', tm.id,
              'slot', tm.slot,
              'species_id', tm.species_id,
              'nickname', tm.nickname,
              'ability_id', tm.ability_id,
              'item_id', tm.item_id,
              'notes', tm.notes,
              'moves', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'slot', tmm.slot,
                    'move_id', tmm.move_id
                  )
                  order by tmm.slot
                )
                from public.team_member_moves tmm
                where tmm.team_member_id = tm.id
              ), '[]'::jsonb)
            )
            order by tm.slot
          )
          from public.team_members tm
          where tm.team_id = (select id from shared_team)
        ), '[]'::jsonb)
      )
    end;
$$;

grant execute on function public.get_shared_team(text) to anon, authenticated;
