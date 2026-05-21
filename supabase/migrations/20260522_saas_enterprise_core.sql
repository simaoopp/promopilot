-- SaaS enterprise foundation, non-destructive.
-- Apply first in STAGING. Production requires backup + backfill review before enforcing NOT NULL organization_id.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active','trialing','past_due','suspended','cancelled')),
  billing_email text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','admin','manager','store_user','viewer','support')),
  store_id uuid,
  status text not null default 'active' check (status in ('active','invited','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  email text,
  status text not null default 'active' check (status in ('active','disabled')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

alter table public.organization_members
  add constraint organization_members_store_fk
  foreign key (store_id) references public.stores(id) on delete set null;

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('owner','admin','manager','store_user','viewer')),
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, lower(email))
);

create table if not exists public.plans (
  id text primary key,
  name text not null,
  status text not null default 'active' check (status in ('active','hidden','deprecated')),
  price_monthly_cents integer not null default 0,
  currency text not null default 'EUR',
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.plan_limits (
  plan_id text primary key references public.plans(id) on delete cascade,
  max_stores integer not null default 1,
  max_users integer not null default 3,
  max_campaigns_month integer not null default 100,
  max_pdfs_month integer not null default 100,
  max_emails_month integer not null default 20,
  max_articles integer not null default 250000,
  max_storage_mb integer not null default 1024,
  ai_requests_month integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_id text references public.plans(id),
  status text not null default 'trialing' check (status in ('trialing','active','past_due','cancelled','manual')),
  provider text not null default 'manual' check (provider in ('manual','stripe','paddle')),
  provider_customer_id text,
  provider_subscription_id text,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  provider text not null default 'manual',
  provider_invoice_id text,
  status text not null default 'draft',
  amount_cents integer not null default 0,
  currency text not null default 'EUR',
  invoice_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  quantity integer not null default 1 check (quantity > 0),
  period_month text not null,
  metadata jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_usage_monthly (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_month text not null,
  campaigns_count integer not null default 0,
  pdfs_count integer not null default 0,
  emails_count integer not null default 0,
  ai_requests_count integer not null default 0,
  storage_mb numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id, period_month)
);

create table if not exists public.app_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  type text not null,
  status text not null default 'pending' check (status in ('pending','processing','processed','sent','failed','cancelled','retrying')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.processed_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  message_id text not null,
  subject text,
  from_email text,
  status text not null default 'processed' check (status in ('pending','processing','processed','sent','failed','ignored')),
  error_message text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, message_id)
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  scopes text[] not null default array[]::text[],
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  url text not null,
  secret_hash text not null,
  events text[] not null default array[]::text[],
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.webhooks(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  status text not null default 'pending',
  response_status integer,
  response_body text,
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  metadata jsonb,
  request_id text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  article_code text not null,
  previous_price numeric,
  new_price numeric,
  source text,
  changed_by uuid references auth.users(id) on delete set null,
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  support_user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  reason text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  campaign_id uuid,
  article_code text not null,
  barcode text,
  description text,
  old_price numeric,
  new_price numeric,
  discount_percent numeric,
  store_id uuid references public.stores(id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Non-destructive SaaS columns on existing product tables.
alter table if exists public.profiles add column if not exists role text not null default 'user';
alter table if exists public.profiles add column if not exists default_organization_id uuid references public.organizations(id) on delete set null;

alter table if exists public.articles add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table if exists public.campaigns add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table if exists public.automatic_campaigns add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table if exists public.templates add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- Utility functions.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.role, 'user')
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('admin','super_admin','superadmin'), false);
$$;

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_platform_admin()
    or exists (
      select 1
      from public.organization_members om
      where om.organization_id = p_organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
    ),
    false
  );
$$;

create or replace function public.has_org_role(p_organization_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_platform_admin()
    or exists (
      select 1
      from public.organization_members om
      where om.organization_id = p_organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and om.role = any(p_roles)
    ),
    false
  );
$$;

create or replace function public.can_access_store(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_platform_admin()
    or exists (
      select 1
      from public.stores s
      join public.organization_members om on om.organization_id = s.organization_id
      where s.id = p_store_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and (
          om.role in ('owner','admin','manager','viewer')
          or (om.role = 'store_user' and om.store_id = s.id)
        )
    ),
    false
  );
$$;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;
grant execute on function public.can_access_store(uuid) to authenticated;

-- Indexes.
create index if not exists organization_members_user_idx on public.organization_members(user_id);
create index if not exists organization_members_org_idx on public.organization_members(organization_id);
create index if not exists stores_org_idx on public.stores(organization_id);
create index if not exists usage_events_org_month_idx on public.usage_events(organization_id, period_month);
create index if not exists audit_logs_org_created_idx on public.audit_logs(organization_id, created_at desc);
create index if not exists app_jobs_status_created_idx on public.app_jobs(status, created_at);
create index if not exists processed_emails_org_message_idx on public.processed_emails(organization_id, message_id);
create index if not exists articles_org_idx on public.articles(organization_id) where organization_id is not null;
create index if not exists automatic_campaigns_org_idx on public.automatic_campaigns(organization_id) where organization_id is not null;

-- Enable RLS.
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.stores enable row level security;
alter table public.invitations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.usage_events enable row level security;
alter table public.organization_usage_monthly enable row level security;
alter table public.app_jobs enable row level security;
alter table public.processed_emails enable row level security;
alter table public.api_keys enable row level security;
alter table public.webhooks enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.audit_logs enable row level security;
alter table public.price_history enable row level security;
alter table public.support_access_grants enable row level security;
alter table public.campaign_items enable row level security;

-- Policies.
drop policy if exists organizations_member_read on public.organizations;
create policy organizations_member_read on public.organizations
for select to authenticated
using (public.is_org_member(id));

drop policy if exists organizations_owner_update on public.organizations;
create policy organizations_owner_update on public.organizations
for update to authenticated
using (public.has_org_role(id, array['owner','admin']))
with check (public.has_org_role(id, array['owner','admin']));

drop policy if exists organization_members_read_org on public.organization_members;
create policy organization_members_read_org on public.organization_members
for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists organization_members_admin_write on public.organization_members;
create policy organization_members_admin_write on public.organization_members
for all to authenticated
using (public.has_org_role(organization_id, array['owner','admin']))
with check (public.has_org_role(organization_id, array['owner','admin']));

drop policy if exists stores_member_read on public.stores;
create policy stores_member_read on public.stores
for select to authenticated
using (public.is_org_member(organization_id));

drop policy if exists stores_admin_write on public.stores;
create policy stores_admin_write on public.stores
for all to authenticated
using (public.has_org_role(organization_id, array['owner','admin','manager']))
with check (public.has_org_role(organization_id, array['owner','admin','manager']));

-- Generic organization-scoped policy helper application.
-- Repeated explicitly because Postgres policies cannot be dynamically created portably in a simple migration.
drop policy if exists invitations_admin_all on public.invitations;
create policy invitations_admin_all on public.invitations for all to authenticated
using (public.has_org_role(organization_id, array['owner','admin']))
with check (public.has_org_role(organization_id, array['owner','admin']));

drop policy if exists subscriptions_owner_read on public.subscriptions;
create policy subscriptions_owner_read on public.subscriptions for select to authenticated
using (public.has_org_role(organization_id, array['owner','admin']));

drop policy if exists invoices_owner_read on public.invoices;
create policy invoices_owner_read on public.invoices for select to authenticated
using (public.has_org_role(organization_id, array['owner','admin']));

drop policy if exists usage_events_org_read on public.usage_events;
create policy usage_events_org_read on public.usage_events for select to authenticated
using (public.has_org_role(organization_id, array['owner','admin']));

drop policy if exists app_jobs_org_read on public.app_jobs;
create policy app_jobs_org_read on public.app_jobs for select to authenticated
using (organization_id is null and public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists processed_emails_org_read on public.processed_emails;
create policy processed_emails_org_read on public.processed_emails for select to authenticated
using (organization_id is null and public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists audit_logs_org_read on public.audit_logs;
create policy audit_logs_org_read on public.audit_logs for select to authenticated
using (organization_id is null and public.is_platform_admin() or public.has_org_role(organization_id, array['owner','admin']));

drop policy if exists campaign_items_org_read on public.campaign_items;
create policy campaign_items_org_read on public.campaign_items for select to authenticated
using (organization_id is null and public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists campaign_items_org_write on public.campaign_items;
create policy campaign_items_org_write on public.campaign_items for all to authenticated
using (organization_id is null and public.is_platform_admin() or public.has_org_role(organization_id, array['owner','admin','manager']))
with check (organization_id is null and public.is_platform_admin() or public.has_org_role(organization_id, array['owner','admin','manager']));

-- Existing tables: allow legacy null org rows only for platform admin until backfill completes.
do $$
begin
  if to_regclass('public.campaigns') is not null then
    alter table public.campaigns enable row level security;
    drop policy if exists campaigns_org_read on public.campaigns;
    create policy campaigns_org_read on public.campaigns for select to authenticated
    using (organization_id is not null and public.is_org_member(organization_id) or public.is_platform_admin());
  end if;

  if to_regclass('public.automatic_campaigns') is not null then
    alter table public.automatic_campaigns enable row level security;
    drop policy if exists automatic_campaigns_org_read on public.automatic_campaigns;
    create policy automatic_campaigns_org_read on public.automatic_campaigns for select to authenticated
    using (organization_id is not null and public.is_org_member(organization_id) or public.is_platform_admin());
  end if;
end $$;

-- Storage path convention: {organization_id}/...
insert into storage.buckets (id, name, public)
values ('automatic-campaign-pdfs', 'automatic-campaign-pdfs', false)
on conflict (id) do update set public = false;

create or replace function public.storage_object_org_id(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  first_segment text;
begin
  first_segment := split_part(coalesce(p_name, ''), '/', 1);
  if first_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return first_segment::uuid;
  end if;
  return null;
end;
$$;

grant execute on function public.storage_object_org_id(text) to authenticated;

alter table storage.objects enable row level security;

drop policy if exists storage_campaign_pdfs_org_read on storage.objects;
create policy storage_campaign_pdfs_org_read on storage.objects
for select to authenticated
using (
  bucket_id = 'automatic-campaign-pdfs'
  and public.is_org_member(public.storage_object_org_id(name))
);

drop policy if exists storage_campaign_pdfs_org_write on storage.objects;
create policy storage_campaign_pdfs_org_write on storage.objects
for insert to authenticated
with check (
  bucket_id = 'automatic-campaign-pdfs'
  and public.has_org_role(public.storage_object_org_id(name), array['owner','admin','manager'])
);

insert into public.plans (id, name, price_monthly_cents, currency, features)
values
  ('starter', 'Starter', 2900, 'EUR', '{"stores":1,"users":3,"email_automation":false}'::jsonb),
  ('pro', 'Pro', 7900, 'EUR', '{"stores":5,"users":20,"email_automation":true}'::jsonb),
  ('business', 'Business', 19900, 'EUR', '{"stores":20,"users":"unlimited","email_automation":true}'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  price_monthly_cents = excluded.price_monthly_cents,
  features = excluded.features;

insert into public.plan_limits (plan_id, max_stores, max_users, max_campaigns_month, max_pdfs_month, max_emails_month, max_articles, max_storage_mb, ai_requests_month)
values
  ('starter', 1, 3, 100, 100, 20, 50000, 1024, 0),
  ('pro', 5, 20, 1000, 1000, 200, 250000, 10240, 500),
  ('business', 20, 100000, 10000, 10000, 2000, 1000000, 102400, 5000)
on conflict (plan_id) do update set
  max_stores = excluded.max_stores,
  max_users = excluded.max_users,
  max_campaigns_month = excluded.max_campaigns_month,
  max_pdfs_month = excluded.max_pdfs_month,
  max_emails_month = excluded.max_emails_month,
  max_articles = excluded.max_articles,
  max_storage_mb = excluded.max_storage_mb,
  ai_requests_month = excluded.ai_requests_month,
  updated_at = now();

select pg_notify('pgrst', 'reload schema');
