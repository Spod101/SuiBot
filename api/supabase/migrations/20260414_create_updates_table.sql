create extension if not exists pgcrypto;

create table if not exists public.updates (
  id uuid primary key default gen_random_uuid(),
  chapter text not null,
  owner text not null,
  title text not null,
  status text not null,
  event_date date,
  notes text,
  pax_target integer,
  pax_actual integer,
  is_risk boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists updates_created_at_idx on public.updates (created_at desc);
create index if not exists updates_status_idx on public.updates (status);
create index if not exists updates_chapter_idx on public.updates (chapter);
create index if not exists updates_is_risk_idx on public.updates (is_risk);

alter table public.updates
  add constraint updates_pax_target_non_negative check (pax_target is null or pax_target >= 0);

alter table public.updates
  add constraint updates_pax_actual_non_negative check (pax_actual is null or pax_actual >= 0);

alter table public.updates enable row level security;
