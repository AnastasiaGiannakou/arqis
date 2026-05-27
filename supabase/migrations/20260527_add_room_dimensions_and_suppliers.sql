-- ARQIS room dimension and supplier schema
-- Run this after 20260527_create_client_project_schema.sql.

alter table public.rooms
  add column if not exists length_m numeric(12, 3),
  add column if not exists width_m numeric(12, 3),
  add column if not exists height_m numeric(8, 3),
  add column if not exists floor_area_m2 numeric(12, 3),
  add column if not exists wall_area_m2 numeric(12, 3),
  add column if not exists opening_area_m2 numeric(12, 3),
  add column if not exists measured_dimensions jsonb not null default '{}'::jsonb;

-- Keep the earlier ceiling_height_m field for compatibility, but height_m is the main room height field going forward.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  supplier_type text,
  website text,
  email text,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  name text not null,
  product_type text,
  sku text,
  unit text not null default 'm2',
  unit_price numeric(12, 2),
  currency text not null default 'GBP',
  product_url text,
  image_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supplier_products_supplier_id_idx on public.supplier_products(supplier_id);
create index if not exists suppliers_supplier_type_idx on public.suppliers(supplier_type);
create index if not exists supplier_products_product_type_idx on public.supplier_products(product_type);

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at
before update on public.suppliers
for each row execute function public.set_updated_at();

drop trigger if exists supplier_products_set_updated_at on public.supplier_products;
create trigger supplier_products_set_updated_at
before update on public.supplier_products
for each row execute function public.set_updated_at();

alter table public.suppliers enable row level security;
alter table public.supplier_products enable row level security;
