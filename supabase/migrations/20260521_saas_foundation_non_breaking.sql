-- Fundação SaaS não destrutiva.
-- Esta migration cria a estrutura base multi-tenant sem obrigar ainda a migração total.
-- Não troca as RLS existentes das tabelas antigas. Serve para preparar a evolução sem quebrar o produto atual.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  status text not null default 'active' check (status in ('active', 'trialing', 'suspended', 'cancelled')),
  plan_code text not null default 'internal',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  role text not null default 'viewer' check (role in ('owner', 'admin', 'manager', 'store_user', 'viewer', 'support')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_members_user_or_invite_check check (user_id is not null or invited_email is not null)
);

create unique index if not exists organization_members_unique_user_idx
on public.organization_members (organization_id, user_id)
where user_id is not null;

create unique index if not exists organization_members_unique_invite_idx
on public.organization_members (organization_id, lower(invited_email))
where invited_email is not null;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('owner', 'admin', 'manager', 'store_user', 'viewer')),
  token_hash text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'manual' check (provider in ('manual', 'stripe', 'paddle')),
  provider_customer_id text,
  provider_subscription_id text,
  plan_code text not null default 'internal',
  status text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'paused', 'cancelled')),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  quantity integer not null default 1 check (quantity > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  before jsonb,
  after jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  type text not null default 'label',
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Adiciona organization_id de forma nullable às tabelas antigas, apenas quando existem.
do $$
begin
  if to_regclass('public.articles') is not null then
    alter table public.articles add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
    create index if not exists articles_organization_id_idx on public.articles (organization_id);
  end if;

  if to_regclass('public.campaigns') is not null then
    alter table public.campaigns add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
    create index if not exists campaigns_organization_id_idx on public.campaigns (organization_id);
  end if;

  if to_regclass('public.automatic_campaigns') is not null then
    alter table public.automatic_campaigns add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
    create index if not exists automatic_campaigns_organization_id_idx on public.automatic_campaigns (organization_id);
  end if;
end $$;

create index if not exists organization_members_user_id_idx on public.organization_members (user_id);
create index if not exists organization_members_organization_id_idx on public.organization_members (organization_id);
create index if not exists stores_organization_id_idx on public.stores (organization_id);
create index if not exists invitations_organization_id_idx on public.invitations (organization_id);
create index if not exists subscriptions_organization_id_idx on public.subscriptions (organization_id);
create index if not exists usage_events_organization_created_idx on public.usage_events (organization_id, created_at desc);
create index if not exists audit_logs_organization_created_idx on public.audit_logs (organization_id, created_at desc);

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
$$;

create or replace function public.has_org_role(p_organization_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.role = any(p_roles)
  );
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.stores enable row level security;
alter table public.invitations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.organization_settings enable row level security;
alter table public.templates enable row level security;

drop policy if exists "organizations_member_select" on public.organizations;
create policy "organizations_member_select"
on public.organizations
for select
to authenticated
using (public.is_org_member(id));

drop policy if exists "organization_members_member_select" on public.organization_members;
create policy "organization_members_member_select"
on public.organization_members
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "stores_member_select" on public.stores;
create policy "stores_member_select"
on public.stores
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "stores_admin_write" on public.stores;
create policy "stores_admin_write"
on public.stores
for all
to authenticated
using (public.has_org_role(organization_id, array['owner','admin']))
with check (public.has_org_role(organization_id, array['owner','admin']));

drop policy if exists "templates_member_select" on public.templates;
create policy "templates_member_select"
on public.templates
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "templates_manager_write" on public.templates;
create policy "templates_manager_write"
on public.templates
for all
to authenticated
using (public.has_org_role(organization_id, array['owner','admin','manager']))
with check (public.has_org_role(organization_id, array['owner','admin','manager']));

drop policy if exists "usage_events_owner_select" on public.usage_events;
create policy "usage_events_owner_select"
on public.usage_events
for select
to authenticated
using (public.has_org_role(organization_id, array['owner','admin']));

drop policy if exists "audit_logs_owner_select" on public.audit_logs;
create policy "audit_logs_owner_select"
on public.audit_logs
for select
to authenticated
using (public.has_org_role(organization_id, array['owner','admin']));

select pg_notify('pgrst', 'reload schema');
