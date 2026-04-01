# Supabase Backend Scaffold

This directory adds the first backend layer for account-backed Radical Red Dex features without changing the current static frontend runtime.

## What is included

- `migrations/20260331123000_auth_teams_save_imports.sql`
  - Auth profile trigger from `auth.users`
  - Tables for profiles, teams, team members, team moves, favorites, save imports, and imported Pokemon
  - RLS policies for private/public access
  - `get_shared_team(team_slug text)` RPC for share-link access to `public` and `unlisted` teams without making unlisted teams broadly selectable
- `functions/import-save/index.ts`
  - Supabase Edge Function entry point for `.sav` parsing
- `functions/_shared/radical-red-save.ts`
  - Shared TypeScript parser scaffold based on the current browser-side parser

## Recommended product choices

- Auth: email + password first
- Optional later: add magic links after basic account flows are stable
- Hosting: keep the site static and call Supabase from the browser
- Server logic: use Edge Functions for save import and share-link helper workflows

## Schema notes

### Profiles

- `profiles` is keyed by `auth.users.id`
- New auth users get a profile row automatically via trigger
- `is_public` controls whether a profile is visible at all

### Teams

- `teams.visibility`
  - `private`: owner only
  - `unlisted`: not directly selectable via RLS, but accessible through `get_shared_team(slug)`
  - `public`: directly readable

This avoids the common mistake where unlisted teams become queryable by any anonymous client.

### Favorites

- `favorite_species.visibility` is per favorite
- `profiles.favorites_are_public` lets the frontend set a user default when creating new favorites

### Save imports

- `save_imports` stores trainer/randomizer metadata
- `imported_pokemon` and `imported_pokemon_moves` are the future landing tables for party/box parsing

## Save parser roadmap

The current server parser intentionally mirrors only the metadata extraction already present in `src/abilityRandomizer.js`:

- trainer name
- trainer ID
- Hardcore / Restricted flags
- learnset / ability / species randomizer flags

The next parser step is to decode party and box Pokemon structs from the save.

### Can we get Pokemon locations from the save?

Yes, for owned Pokemon.

Gen III Pokemon data stores origin metadata such as:

- met location ID
- met level
- met game
- ball used

What is still missing is the Radical Red-specific mapping from `met_location_id` to a human-readable area name. The parser scaffold leaves a hook for that.

## Suggested implementation order

1. Run the SQL migration in Supabase.
2. Add frontend auth state and sign-in/sign-up UI.
3. Build CRUD for teams and favorites against the new tables.
4. Use `get_shared_team(slug)` for share pages.
5. Wire the current browser save upload to call `functions/v1/import-save`.
6. Extend the parser to return party Pokemon, learned moves, and met locations.

## Local validation

### Fast path: validate against a hosted Supabase project

1. Create a Supabase project.
2. Run the migration in `migrations/20260331123000_auth_teams_save_imports.sql`.
3. Deploy the `import-save` function.
4. Create `src/supabaseConfig.local.js` from `src/supabaseConfig.local.example.js`, or generate it with:

```bash
scripts/setup-local-supabase-config.sh https://your-project.supabase.co YOUR_ANON_KEY
```

5. Run a local static server from the repo root:

```bash
python3 -m http.server 8080
```

6. Open `http://localhost:8080`.
7. Validate:
   - sign up / sign in works
   - creating a team inserts into `teams`
   - favoriting a species inserts into `favorite_species`
   - adding a species to a team slot inserts into `team_members` and `team_member_moves`
   - `?team=<share_slug>` renders a shared team card

### Full local path: Supabase CLI

Supabase CLI can run the local stack with `supabase start`, but it requires a local `supabase/config.toml` created by `supabase init`. Official reference:
https://supabase.com/docs/reference/cli/supabase-start

Typical local flow:

1. `supabase init`
2. `supabase start`
3. `supabase db reset`
4. `supabase functions serve import-save`
5. Generate `src/supabaseConfig.local.js`

```bash
scripts/setup-local-supabase-config.sh
```

This script will try to read the local API URL and anon key from `supabase status -o env`. If the CLI output is unavailable, pass them explicitly:

```bash
scripts/setup-local-supabase-config.sh http://127.0.0.1:54321 YOUR_LOCAL_ANON_KEY
```

6. Run `python3 -m http.server 8080`

### Notes for local auth testing

- The app now automatically loads `src/supabaseConfig.local.js` if the file exists.
- `src/supabaseConfig.local.js` is gitignored, so you can keep your local or hosted test keys there without touching tracked files.
- For hosted projects, if email confirmation is enabled, add `http://127.0.0.1:8080` and `http://localhost:8080` to your Auth redirect URLs and Site URL if you want confirmation links to return to the local app.
- For local Supabase CLI stacks, email confirmations are off by default in local development, and auth emails are visible in Mailpit at `http://localhost:54324`.
