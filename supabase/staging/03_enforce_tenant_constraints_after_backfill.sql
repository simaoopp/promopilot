-- Staging-only strict tenant enforcement.
-- Run only after 20260523_saas_tenant_backfill_activation.sql and after validating that the counts below are zero.

select 'articles_without_org' as check_name, count(*) as count from public.articles where organization_id is null
union all
select 'automatic_campaigns_without_org', count(*) from public.automatic_campaigns where organization_id is null;

-- Uncomment after the counts above are zero in staging and the app has been tested.
-- alter table public.articles validate constraint articles_organization_required;
-- alter table public.automatic_campaigns validate constraint automatic_campaigns_organization_required;

-- Optional new-row enforcement. NOT VALID constraints still enforce new writes.
-- Use only after all write paths pass organization_id.
-- alter table public.articles add constraint articles_organization_required check (organization_id is not null) not valid;
-- alter table public.automatic_campaigns add constraint automatic_campaigns_organization_required check (organization_id is not null) not valid;
