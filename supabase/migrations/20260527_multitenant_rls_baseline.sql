-- Multi-tenant RLS baseline hardening.
--
-- Status: validated first in staging after the isolated Cloud Run/Resend setup.
-- Purpose:
-- - Enforce organization_id on business-critical tenant tables.
-- - Replace legacy store-only campaign policies with organization-aware policies.
-- - Standardize read/write policies for articles, campaign_items, processed_emails,
--   price_history, stores, campaigns, automatic_campaigns.
-- - Add storage policies for organization-prefixed PDF paths.
--
-- Important production note:
-- This migration keeps the legacy production storage policy
-- automatic_campaign_pdfs_select_store_scope in place. Remove it only after all
-- production PDFs are confirmed to use organization_id-prefixed paths.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Helper functions
-- -----------------------------------------------------------------------------

create or replace function public.can_access_store_in_org(
  p_organization_id uuid,
  p_store text
)
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
      left join public.stores s
        on s.id = om.store_id
      where om.organization_id = p_organization_id
        and om.user_id = auth.uid()
        and om.status = 'active'
        and (
          om.role in ('owner', 'admin', 'manager', 'viewer')
          or (
            om.role = 'store_user'
            and p_store is not null
            and trim(p_store) <> ''
            and (
              lower(trim(s.code)) = lower(trim(p_store))
              or lower(trim(s.name)) = lower(trim(p_store))
            )
          )
        )
    ),
    false
  );
$$;

comment on function public.can_access_store_in_org(uuid, text)
is 'Organization-aware legacy store text access helper. Owner/admin/manager/viewer can read organization scope; store_user is constrained to its mapped store within the organization.';

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

comment on function public.storage_object_org_id(text)
is 'Extracts organization_id from storage object paths shaped as organization_id/yyyy-mm-dd/message-id/file.pdf.';

-- -----------------------------------------------------------------------------
-- Enforce tenant ownership on critical business tables
-- -----------------------------------------------------------------------------

alter table if exists public.articles
  alter column organization_id set not null;

alter table if exists public.campaigns
  alter column organization_id set not null;

alter table if exists public.automatic_campaigns
  alter column organization_id set not null;

alter table if exists public.campaign_items
  alter column organization_id set not null;

alter table if exists public.processed_emails
  alter column organization_id set not null;

alter table if exists public.price_history
  alter column organization_id set not null;

-- Stores already require organization_id, but keep this explicit for drift safety.
alter table if exists public.stores
  alter column organization_id set not null;

-- -----------------------------------------------------------------------------
-- Indexes for tenant filters
-- -----------------------------------------------------------------------------

create index if not exists idx_articles_organization_id
  on public.articles (organization_id);

create index if not exists idx_campaigns_organization_id
  on public.campaigns (organization_id);

create index if not exists idx_automatic_campaigns_organization_id
  on public.automatic_campaigns (organization_id);

create index if not exists idx_campaign_items_organization_id
  on public.campaign_items (organization_id);

create index if not exists idx_processed_emails_organization_id
  on public.processed_emails (organization_id);

create index if not exists idx_price_history_organization_id
  on public.price_history (organization_id);

create index if not exists idx_stores_organization_id
  on public.stores (organization_id);

create index if not exists idx_storage_objects_bucket_name
  on storage.objects (bucket_id, name);

-- -----------------------------------------------------------------------------
-- Table privileges. RLS policies still control row access.
-- -----------------------------------------------------------------------------

grant select on public.articles to authenticated;
grant insert, update, delete on public.articles to authenticated;

grant select on public.campaigns to authenticated;
grant insert, update, delete on public.campaigns to authenticated;

grant select on public.automatic_campaigns to authenticated;
grant delete on public.automatic_campaigns to authenticated;

grant select on public.campaign_items to authenticated;
grant insert, update, delete on public.campaign_items to authenticated;

grant select on public.processed_emails to authenticated;

grant select on public.price_history to authenticated;
grant insert, update, delete on public.price_history to authenticated;

grant select on public.stores to authenticated;
grant insert, update, delete on public.stores to authenticated;

grant select, insert on storage.objects to authenticated;

-- -----------------------------------------------------------------------------
-- Campaign policies: organization-aware store scope
-- -----------------------------------------------------------------------------

drop policy if exists campaigns_select_store_scope on public.campaigns;
drop policy if exists campaigns_insert_store_scope on public.campaigns;
drop policy if exists campaigns_update_store_scope on public.campaigns;
drop policy if exists campaigns_delete_store_scope on public.campaigns;
drop policy if exists campaigns_org_read on public.campaigns;

drop policy if exists campaigns_select_org_scope on public.campaigns;
drop policy if exists campaigns_insert_org_scope on public.campaigns;
drop policy if exists campaigns_update_org_scope on public.campaigns;
drop policy if exists campaigns_delete_org_scope on public.campaigns;

create policy campaigns_select_org_scope
on public.campaigns
for select
to authenticated
using (
  public.can_access_store_in_org(organization_id, store)
);

create policy campaigns_insert_org_scope
on public.campaigns
for insert
to authenticated
with check (
  public.has_org_role(organization_id, array['owner','admin','manager','store_user'])
  and public.can_access_store_in_org(organization_id, store)
);

create policy campaigns_update_org_scope
on public.campaigns
for update
to authenticated
using (
  public.has_org_role(organization_id, array['owner','admin','manager','store_user'])
  and public.can_access_store_in_org(organization_id, store)
)
with check (
  public.has_org_role(organization_id, array['owner','admin','manager','store_user'])
  and public.can_access_store_in_org(organization_id, store)
);

create policy campaigns_delete_org_scope
on public.campaigns
for delete
to authenticated
using (
  public.has_org_role(organization_id, array['owner','admin','manager'])
);

-- -----------------------------------------------------------------------------
-- Automatic campaign policies
-- -----------------------------------------------------------------------------

drop policy if exists automatic_campaigns_select_store_scope on public.automatic_campaigns;
drop policy if exists automatic_campaigns_delete_store_scope on public.automatic_campaigns;
drop policy if exists automatic_campaigns_org_read on public.automatic_campaigns;

drop policy if exists automatic_campaigns_select_org_scope on public.automatic_campaigns;
drop policy if exists automatic_campaigns_delete_org_scope on public.automatic_campaigns;

create policy automatic_campaigns_select_org_scope
on public.automatic_campaigns
for select
to authenticated
using (
  public.can_access_store_in_org(organization_id, store)
);

create policy automatic_campaigns_delete_org_scope
on public.automatic_campaigns
for delete
to authenticated
using (
  public.has_org_role(organization_id, array['owner','admin','manager'])
);

-- -----------------------------------------------------------------------------
-- Articles and supporting operational tables
-- -----------------------------------------------------------------------------

drop policy if exists articles_org_admin_all on public.articles;
drop policy if exists articles_org_read on public.articles;
drop policy if exists articles_org_write on public.articles;

create policy articles_org_read
on public.articles
for select
to authenticated
using (
  public.is_org_member(organization_id)
);

create policy articles_org_write
on public.articles
for all
to authenticated
using (
  public.has_org_role(organization_id, array['owner','admin','manager'])
)
with check (
  public.has_org_role(organization_id, array['owner','admin','manager'])
);

drop policy if exists campaign_items_org_read on public.campaign_items;
drop policy if exists campaign_items_org_write on public.campaign_items;

create policy campaign_items_org_read
on public.campaign_items
for select
to authenticated
using (
  public.is_org_member(organization_id)
);

create policy campaign_items_org_write
on public.campaign_items
for all
to authenticated
using (
  public.has_org_role(organization_id, array['owner','admin','manager'])
)
with check (
  public.has_org_role(organization_id, array['owner','admin','manager'])
);

drop policy if exists processed_emails_org_read on public.processed_emails;

create policy processed_emails_org_read
on public.processed_emails
for select
to authenticated
using (
  public.is_org_member(organization_id)
);

drop policy if exists price_history_org_read on public.price_history;
drop policy if exists price_history_org_write on public.price_history;

create policy price_history_org_read
on public.price_history
for select
to authenticated
using (
  public.is_org_member(organization_id)
);

create policy price_history_org_write
on public.price_history
for all
to authenticated
using (
  public.has_org_role(organization_id, array['owner','admin','manager'])
)
with check (
  public.has_org_role(organization_id, array['owner','admin','manager'])
);

-- Keep store policies explicit and drift-resistant.
drop policy if exists stores_member_read on public.stores;
drop policy if exists stores_admin_write on public.stores;

create policy stores_member_read
on public.stores
for select
to authenticated
using (
  public.is_org_member(organization_id)
);

create policy stores_admin_write
on public.stores
for all
to authenticated
using (
  public.has_org_role(organization_id, array['owner','admin','manager'])
)
with check (
  public.has_org_role(organization_id, array['owner','admin','manager'])
);

-- -----------------------------------------------------------------------------
-- Storage policies for organization-prefixed PDF paths.
-- Expected object name format:
--   <organization_id>/<yyyy-mm-dd>/<message_or_campaign_id>/<store>.pdf
-- -----------------------------------------------------------------------------

-- Production bucket org policies. The legacy store-scope SELECT policy is kept
-- intentionally until production object paths are fully audited.
drop policy if exists storage_campaign_pdfs_org_read on storage.objects;
drop policy if exists storage_campaign_pdfs_org_write on storage.objects;

create policy storage_campaign_pdfs_org_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'automatic-campaign-pdfs'
  and public.is_org_member(public.storage_object_org_id(name))
);

create policy storage_campaign_pdfs_org_write
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'automatic-campaign-pdfs'
  and public.has_org_role(
    public.storage_object_org_id(name),
    array['owner','admin','manager']
  )
);

-- Staging bucket org policies.
drop policy if exists storage_campaign_pdfs_staging_org_read on storage.objects;
drop policy if exists storage_campaign_pdfs_staging_org_write on storage.objects;

create policy storage_campaign_pdfs_staging_org_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'automatic-campaign-pdfs-staging'
  and public.is_org_member(public.storage_object_org_id(name))
);

create policy storage_campaign_pdfs_staging_org_write
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'automatic-campaign-pdfs-staging'
  and public.has_org_role(
    public.storage_object_org_id(name),
    array['owner','admin','manager']
  )
);
