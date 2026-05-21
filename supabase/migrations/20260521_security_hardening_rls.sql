-- Segurança/RLS final para produção.
-- Objetivo: o frontend só vê/edita o que pertence ao utilizador/loja;
-- o backend/Cloud Run continua a operar com service_role, que bypassa RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  store text not null default '',
  must_change_password boolean not null default true,
  role text not null default 'user',
  allowed_stores text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('user', 'manager', 'admin', 'owner'))
);

alter table public.profiles
  add column if not exists first_name text not null default '',
  add column if not exists last_name text not null default '',
  add column if not exists store text not null default '',
  add column if not exists must_change_password boolean not null default true,
  add column if not exists role text not null default 'user',
  add column if not exists allowed_stores text[] not null default '{}'::text[],
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists profiles_store_idx on public.profiles (store);
create index if not exists profiles_role_idx on public.profiles (role);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Apenas service_role pode alterar role/allowed_stores/id/created_at.
  -- O próprio utilizador pode completar nome/loja/onboarding, mas não se promover.
  if auth.role() <> 'service_role' then
    new.id = old.id;
    new.role = old.role;
    new.allowed_stores = old.allowed_stores;
    new.created_at = old.created_at;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_security_fields on public.profiles;
create trigger protect_profile_security_fields
before update on public.profiles
for each row
execute function public.protect_profile_security_fields();

-- ---------------------------------------------------------------------------
-- HELPERS DE AUTORIZAÇÃO
-- ---------------------------------------------------------------------------
create or replace function public.current_profile_store()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((select p.store from public.profiles p where p.id = auth.uid()), '')::text;
$$;

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'user')::text;
$$;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_profile_role() in ('admin', 'owner');
$$;

create or replace function public.can_access_store(target_store text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role in ('admin', 'owner')
        or p.store = coalesce(target_store, '')
        or coalesce(target_store, '') = any(coalesce(p.allowed_stores, '{}'::text[]))
      )
  );
$$;

revoke all on function public.current_profile_store() from public;
revoke all on function public.current_profile_role() from public;
revoke all on function public.is_app_admin() from public;
revoke all on function public.can_access_store(text) from public;
grant execute on function public.current_profile_store() to authenticated;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.can_access_store(text) to authenticated;

-- ---------------------------------------------------------------------------
-- ARTICLES
-- O catálogo grande é lido pelo backend com service_role. Não há acesso direto.
-- ---------------------------------------------------------------------------
alter table public.articles enable row level security;
revoke all on public.articles from anon, authenticated;
drop policy if exists articles_select_authenticated on public.articles;
drop policy if exists articles_select_all_authenticated on public.articles;
drop policy if exists articles_insert_authenticated on public.articles;
drop policy if exists articles_update_authenticated on public.articles;
drop policy if exists articles_delete_authenticated on public.articles;

-- ---------------------------------------------------------------------------
-- CAMPAIGNS MANUAIS
-- ---------------------------------------------------------------------------
create table if not exists public.campaigns (
  id text primary key,
  titulo text not null default 'PROMO',
  dados jsonb not null default '[]'::jsonb,
  ano_validade integer not null default extract(year from now())::integer,
  formato_etiqueta text not null default 'a6',
  origem text not null default 'manual',
  created_by text not null default 'Utilizador',
  created_by_email text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 days'),
  total_artigos integer not null default 0,
  store text not null default '',
  user_id uuid references auth.users(id) on delete set null
);

create index if not exists campaigns_store_created_idx on public.campaigns (store, created_at desc);
create index if not exists campaigns_store_expires_idx on public.campaigns (store, expires_at);
create index if not exists campaigns_user_id_idx on public.campaigns (user_id);

alter table public.campaigns enable row level security;
grant select, insert, update, delete on public.campaigns to authenticated;
revoke all on public.campaigns from anon;

drop policy if exists campaigns_select_store_scope on public.campaigns;
drop policy if exists campaigns_insert_store_scope on public.campaigns;
drop policy if exists campaigns_update_store_scope on public.campaigns;
drop policy if exists campaigns_delete_store_scope on public.campaigns;
drop policy if exists campaigns_select_authenticated on public.campaigns;
drop policy if exists campaigns_insert_authenticated on public.campaigns;
drop policy if exists campaigns_update_authenticated on public.campaigns;
drop policy if exists campaigns_delete_authenticated on public.campaigns;

create policy campaigns_select_store_scope
  on public.campaigns
  for select
  to authenticated
  using (public.can_access_store(store));

create policy campaigns_insert_store_scope
  on public.campaigns
  for insert
  to authenticated
  with check (
    public.can_access_store(store)
    and (user_id is null or user_id = auth.uid() or public.is_app_admin())
  );

create policy campaigns_update_store_scope
  on public.campaigns
  for update
  to authenticated
  using (public.can_access_store(store))
  with check (public.can_access_store(store));

create policy campaigns_delete_store_scope
  on public.campaigns
  for delete
  to authenticated
  using (public.can_access_store(store));

-- ---------------------------------------------------------------------------
-- CAMPANHAS AUTOMÁTICAS
-- Inserção/atualização é feita pelo Cloud Run/backend com service_role.
-- Utilizadores autenticados só leem/apagam o histórico da sua loja.
-- ---------------------------------------------------------------------------
alter table public.automatic_campaigns enable row level security;
grant select, delete on public.automatic_campaigns to authenticated;
revoke insert, update on public.automatic_campaigns from authenticated;
revoke all on public.automatic_campaigns from anon;

drop policy if exists automatic_campaigns_select_authenticated on public.automatic_campaigns;
drop policy if exists automatic_campaigns_insert_authenticated on public.automatic_campaigns;
drop policy if exists automatic_campaigns_update_authenticated on public.automatic_campaigns;
drop policy if exists automatic_campaigns_delete_authenticated on public.automatic_campaigns;
drop policy if exists automatic_campaigns_select_store_scope on public.automatic_campaigns;
drop policy if exists automatic_campaigns_delete_store_scope on public.automatic_campaigns;

create policy automatic_campaigns_select_store_scope
  on public.automatic_campaigns
  for select
  to authenticated
  using (public.can_access_store(store));

create policy automatic_campaigns_delete_store_scope
  on public.automatic_campaigns
  for delete
  to authenticated
  using (public.can_access_store(store));

-- ---------------------------------------------------------------------------
-- PROFILES RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;
revoke all on public.profiles from anon;

drop policy if exists profiles_select_own_or_admin on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own_or_admin on public.profiles;
drop policy if exists profiles_delete_admin on public.profiles;

create policy profiles_select_own_or_admin
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_app_admin());

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

create policy profiles_update_own_or_admin
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid() or public.is_app_admin())
  with check (id = auth.uid() or public.is_app_admin());

-- ---------------------------------------------------------------------------
-- STORAGE: PDFs privados. O backend cria signed URLs curtos.
-- Opcionalmente, clientes autenticados só conseguem ler objetos que pertençam
-- a uma campanha da sua loja.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'automatic-campaign-pdfs',
  'automatic-campaign-pdfs',
  false,
  20971520,
  array['application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists automatic_campaign_pdfs_select_store_scope on storage.objects;
drop policy if exists automatic_campaign_pdfs_public_read on storage.objects;
drop policy if exists automatic_campaign_pdfs_authenticated_read on storage.objects;
drop policy if exists automatic_campaign_pdfs_insert_authenticated on storage.objects;
drop policy if exists automatic_campaign_pdfs_update_authenticated on storage.objects;
drop policy if exists automatic_campaign_pdfs_delete_authenticated on storage.objects;

create policy automatic_campaign_pdfs_select_store_scope
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'automatic-campaign-pdfs'
    and exists (
      select 1
      from public.automatic_campaigns ac
      where public.can_access_store(ac.store)
        and (
          coalesce(ac.pdf_url, '') ilike '%' || storage.objects.name || '%'
          or coalesce(ac.pdfs::text, '') ilike '%' || storage.objects.name || '%'
        )
    )
  );
