-- Sidequest recs for mowke.github.io. Paste into Supabase: SQL Editor -> New query -> Run.
-- Visitors can only ADD notes, and only see notes you've approved.
-- Approve a note: Table Editor -> sidequests -> tick "approved".

create table public.sidequests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 40),
  note text not null check (char_length(note) between 3 and 280),
  kind text not null check (kind in ('together', 'todo')),
  approved boolean not null default false
);

alter table public.sidequests enable row level security;

create policy "visitors pin unapproved notes" on public.sidequests
  for insert to anon with check (approved = false);

create policy "everyone reads approved notes" on public.sidequests
  for select to anon using (approved = true);

-- visitors can't choose their own id, date or approval
revoke insert on public.sidequests from anon;
grant insert (name, note, kind) on public.sidequests to anon;
