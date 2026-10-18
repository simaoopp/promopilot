-- Read-only verification: run immediately after migration, BEFORE CEO edits.
-- The snapshot remains a historical reference after legitimate administrative changes.
with baseline as (
 select expert_id,snapshot from public.platform_migration_snapshots where migration_key='phase-zero-20261015'
), current_rows as (
 select 'organizations'::text entity,to_jsonb(t) row from public.organizations t
 union all select 'stores',to_jsonb(t) from public.stores t
 union all select 'memberships',to_jsonb(t) from public.organization_members t
 union all select 'profiles',to_jsonb(t) from public.profiles t
 union all select 'plans',to_jsonb(t) from public.plans t
 union all select 'subscriptions',to_jsonb(t) from public.subscriptions t
), expected_rows as (
 select k.entity,j.row from baseline b cross join unnest(array['organizations','stores','memberships','profiles','plans','subscriptions']) k(entity)
 cross join lateral jsonb_array_elements(b.snapshot->k.entity) j(row)
)
select 'preserved_rows' as check_name,
 not exists(select 1 from expected_rows e where not exists(select 1 from current_rows c where c.entity=e.entity and c.row=e.row)) as passed
union all
select 'snapshot_expert_identified',exists(select 1 from baseline b join public.organizations o on o.id=b.expert_id)
union all
select 'expert_existing_modules_authorised',not exists(
 select 1 from baseline b cross join public.feature_modules m
 where m.category='core' and not public.platform_org_module(b.expert_id,m.module_key)
)
union all
select 'expert_pos_initially_disabled',exists(select 1 from baseline b where not public.platform_org_module(b.expert_id,'pos'))
union all
select 'no_automatic_ceo',not exists(select 1 from public.platform_admins);

-- The last two checks apply only before the bootstrap/first administrative decisions.
-- Passing these checks does not substitute the login/functional tests for actual Expert users.
