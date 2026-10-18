-- SYNTHETIC TESTS ONLY. Apply after phase_zero.fixture.sql in an isolated DB.
-- Reproduce the relevant structure of the supplied schema: tenant tables exist,
-- the three administrative tables and the two composite unique keys do not.
-- This file is never a production migration.
drop table public.subscriptions;
drop table public.plans;
drop table public.audit_logs;
alter table public.organization_members drop constraint organization_members_organization_id_user_id_key;
alter table public.organization_members drop constraint organization_members_store_id_fkey;
alter table public.organization_members drop constraint organization_members_role_check;
alter table public.organization_members drop constraint organization_members_status_check;
alter table public.stores drop constraint stores_organization_id_code_key;
alter table public.organizations drop constraint organizations_status_check;
