-- Executable multi-tenant RLS test for STAGING.
-- Run after applying:
--   20260522_saas_enterprise_core.sql
--   20260523_saas_tenant_backfill_activation.sql
-- It creates isolated tenant fixtures inside a transaction and rolls them back.

begin;

-- Test identities.
select set_config('test.org_a', '11111111-1111-4111-8111-111111111111', true);
select set_config('test.org_b', '22222222-2222-4222-8222-222222222222', true);
select set_config('test.user_a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('test.user_b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);

insert into public.organizations (id, name, slug, status)
values
  (current_setting('test.org_a')::uuid, 'Tenant QA A', 'tenant-qa-a', 'active'),
  (current_setting('test.org_b')::uuid, 'Tenant QA B', 'tenant-qa-b', 'active')
on conflict (id) do nothing;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    current_setting('test.user_a')::uuid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'tenant-a@example.test',
    crypt('tenant-a-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    current_setting('test.user_b')::uuid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'tenant-b@example.test',
    crypt('tenant-b-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

insert into public.profiles (id, nome, last_name, store, role, default_organization_id)
values
  (current_setting('test.user_a')::uuid, 'Tenant', 'A', 'QA-A', 'user', current_setting('test.org_a')::uuid),
  (current_setting('test.user_b')::uuid, 'Tenant', 'B', 'QA-B', 'user', current_setting('test.org_b')::uuid)
on conflict (id) do update set
  default_organization_id = excluded.default_organization_id,
  role = excluded.role;

insert into public.organization_members (organization_id, user_id, role, status)
values
  (current_setting('test.org_a')::uuid, current_setting('test.user_a')::uuid, 'owner', 'active'),
  (current_setting('test.org_b')::uuid, current_setting('test.user_b')::uuid, 'owner', 'active')
on conflict (organization_id, user_id) do update set role = excluded.role, status = 'active';

insert into public.articles (organization_id, artigo, descricao, pvp1, pvp2, pvp3, codigo_barras, search_terms)
values
  (current_setting('test.org_a')::uuid, 'TENANT-A-001', 'Produto exclusivo tenant-a', '10,00', 10.00, '', '5600000000001', 'produto exclusivo tenant a'),
  (current_setting('test.org_b')::uuid, 'TENANT-B-001', 'Produto exclusivo tenant-b', '20,00', 20.00, '', '5600000000002', 'produto exclusivo tenant b')
on conflict do nothing;

-- User A context.
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.user_a'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.user_a'), 'role', 'authenticated')::text, true);

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.organizations
  where id in (current_setting('test.org_a')::uuid, current_setting('test.org_b')::uuid);

  if v_count <> 1 then
    raise exception 'RLS FAIL: User A can see % organizations; expected 1.', v_count;
  end if;

  select count(*) into v_count
  from public.search_articles_for_labels('tenant-a', 10, 0, current_setting('test.org_a')::uuid);

  if v_count < 1 then
    raise exception 'RLS FAIL: User A cannot find own tenant article.';
  end if;

  begin
    perform * from public.search_articles_for_labels('tenant-b', 10, 0, current_setting('test.org_b')::uuid);
    raise exception 'RLS FAIL: User A queried tenant B without error.';
  exception
    when others then
      if sqlerrm like 'RLS FAIL:%' then
        raise;
      end if;
      -- Expected: Forbidden organization.
      null;
  end;
end $$;

-- User B context.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.user_b'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.user_b'), 'role', 'authenticated')::text, true);

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.organizations
  where id in (current_setting('test.org_a')::uuid, current_setting('test.org_b')::uuid);

  if v_count <> 1 then
    raise exception 'RLS FAIL: User B can see % organizations; expected 1.', v_count;
  end if;

  select count(*) into v_count
  from public.search_articles_for_labels('tenant-b', 10, 0, current_setting('test.org_b')::uuid);

  if v_count < 1 then
    raise exception 'RLS FAIL: User B cannot find own tenant article.';
  end if;

  begin
    perform * from public.search_articles_for_labels('tenant-a', 10, 0, current_setting('test.org_a')::uuid);
    raise exception 'RLS FAIL: User B queried tenant A without error.';
  exception
    when others then
      if sqlerrm like 'RLS FAIL:%' then
        raise;
      end if;
      -- Expected: Forbidden organization.
      null;
  end;
end $$;

reset role;

-- Bucket must be private.
do $$
declare
  v_public boolean;
begin
  select public into v_public
  from storage.buckets
  where id = 'automatic-campaign-pdfs';

  if coalesce(v_public, true) <> false then
    raise exception 'RLS FAIL: automatic-campaign-pdfs bucket is public.';
  end if;
end $$;

rollback;

select 'RLS MULTI-TENANT PERMISSION TESTS: OK' as result;
