-- PromoPilot
-- Hotfix: campaign-end notification must not depend on public.stores.
-- Production schema already has profiles.store and may not have the SaaS stores table.
-- Safe to run more than once.

create or replace function public.resolve_campaign_organization_id(
  p_user_id uuid,
  p_store text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_count integer := 0;
begin
  /*
   * 1. Prefer the user's explicit default organization when the column exists.
   * Dynamic SQL is intentional: some PromoPilot deployments do not have the
   * SaaS columns/tables yet.
   */
  if p_user_id is not null
     and to_regclass('public.profiles') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'profiles'
         and column_name = 'default_organization_id'
     )
  then
    execute $q$
      select p.default_organization_id
      from public.profiles p
      where p.id = $1
        and p.default_organization_id is not null
      limit 1
    $q$
    into v_org
    using p_user_id;

    if v_org is not null then
      return v_org;
    end if;
  end if;

  /*
   * 2. Fall back to the user's organization membership.
   */
  if p_user_id is not null
     and to_regclass('public.organization_members') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'organization_members'
         and column_name = 'organization_id'
     )
  then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'organization_members'
        and column_name = 'status'
    ) then
      execute $q$
        select om.organization_id
        from public.organization_members om
        where om.user_id = $1
          and om.status = 'active'
        order by om.created_at asc nulls last
        limit 1
      $q$
      into v_org
      using p_user_id;
    else
      execute $q$
        select om.organization_id
        from public.organization_members om
        where om.user_id = $1
        limit 1
      $q$
      into v_org
      using p_user_id;
    end if;

    if v_org is not null then
      return v_org;
    end if;
  end if;

  /*
   * 3. Reuse an organization already attached to another automatic campaign
   * from the same store. This preserves tenant consistency without requiring
   * a public.stores catalog.
   */
  if nullif(trim(coalesce(p_store, '')), '') is not null
     and to_regclass('public.automatic_campaigns') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'automatic_campaigns'
         and column_name = 'organization_id'
     )
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'automatic_campaigns'
         and column_name = 'store'
     )
  then
    execute $q$
      select ac.organization_id
      from public.automatic_campaigns ac
      where ac.organization_id is not null
        and lower(trim(ac.store)) = lower(trim($1))
      order by ac.created_at desc nulls last
      limit 1
    $q$
    into v_org
    using p_store;

    if v_org is not null then
      return v_org;
    end if;
  end if;

  /*
   * 4. Current PromoPilot production is normally single-organization.
   * If there is exactly one organization, it is an unambiguous fallback.
   */
  if to_regclass('public.organizations') is not null then
    execute $q$
      select count(*)::integer, (array_agg(o.id order by o.created_at asc))[1]
      from public.organizations o
    $q$
    into v_count, v_org;

    if v_count = 1 and v_org is not null then
      return v_org;
    end if;
  end if;

  /*
   * Do not guess in a true multi-tenant database.
   */
  return null;
end;
$$;

revoke all on function public.resolve_campaign_organization_id(uuid, text) from public;
grant execute on function public.resolve_campaign_organization_id(uuid, text)
  to authenticated, service_role;

comment on function public.resolve_campaign_organization_id(uuid, text) is
  'Resolves campaign organization without requiring public.stores. Uses profile, membership, existing campaign tenant, then single-org fallback.';

-- Diagnostic checks after applying the hotfix.
select
  to_regclass('public.stores') as stores_table,
  to_regclass('public.profiles') as profiles_table,
  to_regclass('public.organization_members') as organization_members_table,
  to_regclass('public.organizations') as organizations_table,
  to_regclass('public.automatic_campaigns') as automatic_campaigns_table;
