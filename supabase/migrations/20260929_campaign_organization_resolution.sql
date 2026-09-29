-- PromoPilot
-- Campaign organization resolution / backfill
-- 2026-09-29
--
-- Purpose:
-- 1. Recover existing campaigns with organization_id = NULL.
-- 2. Guarantee that future manual and automatic campaigns receive an organization_id
--    whenever it can be resolved safely.
-- 3. Never guess when multiple organizations are possible.
--
-- The campaign-end worker should KEEP its safety block for rows that remain NULL.

create or replace function public.resolve_campaign_organization_id(
  p_user_id uuid,
  p_store text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_organization_id uuid;
  v_count integer;
begin
  -- 1) Strongest signal: user's explicit default organization.
  if p_user_id is not null then
    select p.default_organization_id
      into v_organization_id
    from public.profiles p
    where p.id = p_user_id
      and p.default_organization_id is not null
    limit 1;

    if v_organization_id is not null then
      return v_organization_id;
    end if;

    -- 2) Safe fallback: the user has exactly one active organization membership.
    select
      count(distinct om.organization_id),
      (array_agg(distinct om.organization_id))[1]
      into v_count, v_organization_id
    from public.organization_members om
    where om.user_id = p_user_id
      and om.status = 'active';

    if v_count = 1 and v_organization_id is not null then
      return v_organization_id;
    end if;
  end if;

  -- 3) Last safe fallback: this store name/code exists in exactly one organization.
  --    This is useful for system-created campaigns where user_id may be NULL.
  if nullif(trim(coalesce(p_store, '')), '') is not null then
    select
      count(distinct s.organization_id),
      (array_agg(distinct s.organization_id))[1]
      into v_count, v_organization_id
    from public.stores s
    where s.status = 'active'
      and (
        lower(trim(s.name)) = lower(trim(p_store))
        or lower(trim(s.code)) = lower(trim(p_store))
      );

    if v_count = 1 and v_organization_id is not null then
      return v_organization_id;
    end if;
  end if;

  -- Ambiguous/unresolvable = NULL on purpose.
  return null;
end;
$$;

create or replace function public.set_campaign_organization_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is null then
    new.organization_id :=
      public.resolve_campaign_organization_id(new.user_id, new.store);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill existing MANUAL campaigns
-- ---------------------------------------------------------------------------
update public.campaigns c
set organization_id = public.resolve_campaign_organization_id(c.user_id, c.store)
where c.organization_id is null
  and public.resolve_campaign_organization_id(c.user_id, c.store) is not null;

-- ---------------------------------------------------------------------------
-- Backfill existing AUTOMATIC campaigns
-- ---------------------------------------------------------------------------
update public.automatic_campaigns c
set organization_id = public.resolve_campaign_organization_id(c.user_id, c.store)
where c.organization_id is null
  and public.resolve_campaign_organization_id(c.user_id, c.store) is not null;

-- ---------------------------------------------------------------------------
-- Future-proofing: resolve org before every insert/update when missing
-- ---------------------------------------------------------------------------
drop trigger if exists campaigns_set_organization_id on public.campaigns;
create trigger campaigns_set_organization_id
before insert or update of user_id, store, organization_id
on public.campaigns
for each row
execute function public.set_campaign_organization_id();

drop trigger if exists automatic_campaigns_set_organization_id
on public.automatic_campaigns;
create trigger automatic_campaigns_set_organization_id
before insert or update of user_id, store, organization_id
on public.automatic_campaigns
for each row
execute function public.set_campaign_organization_id();

create index if not exists campaigns_organization_id_idx
  on public.campaigns (organization_id)
  where organization_id is not null;

create index if not exists automatic_campaigns_organization_id_idx
  on public.automatic_campaigns (organization_id)
  where organization_id is not null;

-- ---------------------------------------------------------------------------
-- Verification helper (result only; no destructive action)
-- ---------------------------------------------------------------------------
-- Expected after this migration:
--   organization_id should be populated for the test campaign if its user/store
--   maps unambiguously to an organization.
--
-- select
--   id,
--   titulo,
--   store,
--   user_id,
--   organization_id,
--   created_at
-- from public.campaigns
-- where id = 'camp-1790689126132';
