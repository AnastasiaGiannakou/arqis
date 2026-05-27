-- Temporary ARQIS prototype policies.
-- Run this after the first two migrations so the browser app can save records.
-- When ARQIS has login, replace these with user-specific policies.

create policy if not exists "Prototype can read clients"
  on public.clients for select
  to anon, authenticated
  using (true);

create policy if not exists "Prototype can create clients"
  on public.clients for insert
  to anon, authenticated
  with check (true);

create policy if not exists "Prototype can read projects"
  on public.projects for select
  to anon, authenticated
  using (true);

create policy if not exists "Prototype can create projects"
  on public.projects for insert
  to anon, authenticated
  with check (true);

create policy if not exists "Prototype can read floors"
  on public.floors for select
  to anon, authenticated
  using (true);

create policy if not exists "Prototype can create floors"
  on public.floors for insert
  to anon, authenticated
  with check (true);

create policy if not exists "Prototype can read rooms"
  on public.rooms for select
  to anon, authenticated
  using (true);

create policy if not exists "Prototype can create rooms"
  on public.rooms for insert
  to anon, authenticated
  with check (true);

create policy if not exists "Prototype can read suppliers"
  on public.suppliers for select
  to anon, authenticated
  using (true);

create policy if not exists "Prototype can create suppliers"
  on public.suppliers for insert
  to anon, authenticated
  with check (true);

create policy if not exists "Prototype can read supplier products"
  on public.supplier_products for select
  to anon, authenticated
  using (true);

create policy if not exists "Prototype can create supplier products"
  on public.supplier_products for insert
  to anon, authenticated
  with check (true);
