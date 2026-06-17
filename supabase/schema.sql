-- AriaCare Supabase schema
-- Run this in Supabase SQL Editor after creating the project.

create table if not exists public.ariacare_entries (
  id uuid primary key default gen_random_uuid(),
  family_id text not null,
  kind text not null check (kind in ('glucose', 'meal', 'insulin', 'note')),
  logged_at timestamptz not null default now(),
  logged_by text,
  archived boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ariacare_export_history (
  id uuid primary key default gen_random_uuid(),
  family_id text not null,
  file_name text not null,
  record_count integer not null default 0,
  generated_by text,
  generated_at timestamptz not null default now()
);

alter table public.ariacare_entries enable row level security;
alter table public.ariacare_export_history enable row level security;

-- Simple MVP policies: any authenticated AriaCare user can manage this one family app.
-- This is acceptable for mom/dad only. Later, replace family_id text with proper family_members table.
create policy "Authenticated users can read entries"
  on public.ariacare_entries for select
  to authenticated
  using (family_id = 'aria-family');

create policy "Authenticated users can insert entries"
  on public.ariacare_entries for insert
  to authenticated
  with check (family_id = 'aria-family');

create policy "Authenticated users can update entries"
  on public.ariacare_entries for update
  to authenticated
  using (family_id = 'aria-family')
  with check (family_id = 'aria-family');

create policy "Authenticated users can delete entries"
  on public.ariacare_entries for delete
  to authenticated
  using (family_id = 'aria-family');

create policy "Authenticated users can read export history"
  on public.ariacare_export_history for select
  to authenticated
  using (family_id = 'aria-family');

create policy "Authenticated users can insert export history"
  on public.ariacare_export_history for insert
  to authenticated
  with check (family_id = 'aria-family');

-- Auth users to create manually in Supabase Dashboard > Authentication > Users:
-- mom@ariacare.local
-- dad@ariacare.local

-- Required when table privileges are not automatically exposed/granted.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.ariacare_entries to authenticated;
grant select, insert on public.ariacare_export_history to authenticated;
