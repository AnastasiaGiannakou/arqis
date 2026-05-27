-- ARQIS initial database schema
-- Run this in Supabase SQL Editor once for the project database.

create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  address text,
  status text not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.floors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  source_file_name text,
  source_file_type text,
  page_number integer,
  preview_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid not null references public.floors(id) on delete cascade,
  name text not null,
  room_type text,
  area_m2 numeric(12, 3),
  perimeter_m numeric(12, 3),
  ceiling_height_m numeric(8, 3),
  wall_lengths jsonb not null default '[]'::jsonb,
  polygon jsonb not null default '[]'::jsonb,
  costing jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_client_id_idx on public.projects(client_id);
create index if not exists floors_project_id_idx on public.floors(project_id);
create index if not exists rooms_floor_id_idx on public.rooms(floor_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists floors_set_updated_at on public.floors;
create trigger floors_set_updated_at
before update on public.floors
for each row execute function public.set_updated_at();

drop trigger if exists rooms_set_updated_at on public.rooms;
create trigger rooms_set_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

-- Keep Row Level Security enabled so we can add proper access rules before the live app writes data.
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.floors enable row level security;
alter table public.rooms enable row level security;
