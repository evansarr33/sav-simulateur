-- Exemple de RLS: agents voient leurs données, trainers voient tout.
-- Prérequis: table users_profile(user_id uuid primary key, role text check in ('agent','trainer'))
-- 1) Crée la table users_profile si elle n'existe pas
create table if not exists public.users_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'agent' check (role in ('agent','trainer')),
  created_at timestamptz default now()
);

-- 2) Politique de lecture sur sessions
alter table public.sessions enable row level security;
drop policy if exists sessions_read on public.sessions;
create policy sessions_read on public.sessions
for select
to authenticated
using (
  exists (
    select 1 from public.users_profile up
    where up.user_id = auth.uid() and up.role = 'trainer'
  )
  or user_id = auth.uid()
);

-- 3) Policies équivalentes (messages/actions/scores)
alter table public.messages enable row level security;
drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages
for select
to authenticated
using (
  exists (select 1 from public.users_profile up where up.user_id = auth.uid() and up.role='trainer')
  or exists (select 1 from public.sessions s where s.id = messages.session_id and s.user_id = auth.uid())
);

alter table public.actions enable row level security;
drop policy if exists actions_read on public.actions;
create policy actions_read on public.actions
for select
to authenticated
using (
  exists (select 1 from public.users_profile up where up.user_id = auth.uid() and up.role='trainer')
  or exists (select 1 from public.sessions s where s.id = actions.session_id and s.user_id = auth.uid())
);

alter table public.scores enable row level security;
drop policy if exists scores_read on public.scores;
create policy scores_read on public.scores
for select
to authenticated
using (
  exists (select 1 from public.users_profile up where up.user_id = auth.uid() and up.role='trainer')
  or exists (select 1 from public.sessions s where s.id = scores.session_id and s.user_id = auth.uid())
);

-- 4) Donne le rôle trainer à un utilisateur (REMPLACEZ ICI)
-- update public.users_profile set role='trainer' where user_id = 'VOTRE_UUID';
-- Si la ligne n'existe pas :
-- insert into public.users_profile(user_id, role) values ('VOTRE_UUID', 'trainer')
-- on conflict (user_id) do update set role=excluded.role;
