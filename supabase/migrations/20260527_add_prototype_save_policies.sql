-- Temporary ARQIS prototype policies.
-- Run this after the first two migrations so the browser app can save records.
-- When ARQIS has login, replace these with user-specific policies.

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'clients' and policyname = 'Prototype can read clients') then
    create policy "Prototype can read clients" on public.clients for select to anon, authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'clients' and policyname = 'Prototype can create clients') then
    create policy "Prototype can create clients" on public.clients for insert to anon, authenticated with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'Prototype can read projects') then
    create policy "Prototype can read projects" on public.projects for select to anon, authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'Prototype can create projects') then
    create policy "Prototype can create projects" on public.projects for insert to anon, authenticated with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'floors' and policyname = 'Prototype can read floors') then
    create policy "Prototype can read floors" on public.floors for select to anon, authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'floors' and policyname = 'Prototype can create floors') then
    create policy "Prototype can create floors" on public.floors for insert to anon, authenticated with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rooms' and policyname = 'Prototype can read rooms') then
    create policy "Prototype can read rooms" on public.rooms for select to anon, authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rooms' and policyname = 'Prototype can create rooms') then
    create policy "Prototype can create rooms" on public.rooms for insert to anon, authenticated with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'suppliers' and policyname = 'Prototype can read suppliers') then
    create policy "Prototype can read suppliers" on public.suppliers for select to anon, authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'suppliers' and policyname = 'Prototype can create suppliers') then
    create policy "Prototype can create suppliers" on public.suppliers for insert to anon, authenticated with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'supplier_products' and policyname = 'Prototype can read supplier products') then
    create policy "Prototype can read supplier products" on public.supplier_products for select to anon, authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'supplier_products' and policyname = 'Prototype can create supplier products') then
    create policy "Prototype can create supplier products" on public.supplier_products for insert to anon, authenticated with check (true);
  end if;
end $$;
