-- Multi-tenant RLS baseline smoke test.
-- Run in STAGING after 20260527_multitenant_rls_baseline.sql.
-- This test uses a transaction and rolls back all fixture data.

begin;

select set_config('test.org_a', '11111111-1111-4111-8111-111111111111', true);
select set_config('test.org_b', '22222222-2222-4222-8222-222222222222', true);
select set_config('test.user_a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('test.user_b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);

insert into public.organizations (id, name, slug, status)
values
  (current_setting('test.org_a')::uuid, 'RLS Baseline A', 'rls-baseline-a', 'active'),
  (current_setting('test.org_b')::uuid, 'RLS Baseline B', 'rls-baseline-b', 'active')
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
    'rls-baseline-a@example.test',
    crypt('rls-a-password', gen_salt('bf')),
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
    'rls-baseline-b@example.test',
    crypt('rls-b-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

insert into public.profiles (id, nome, last_name, role, default_organization_id)
values
  (current_setting('test.user_a')::uuid, 'RLS', 'A', 'user', current_setting('test.org_a')::uuid),
  (current_setting('test.user_b')::uuid, 'RLS', 'B', 'user', current_setting('test.org_b')::uuid)
on conflict (id) do update set
  default_organization_id = excluded.default_organization_id,
  role = excluded.role;

insert into public.organization_members (organization_id, user_id, role, status)
values
  (current_setting('test.org_a')::uuid, current_setting('test.user_a')::uuid, 'owner', 'active'),
  (current_setting('test.org_b')::uuid, current_setting('test.user_b')::uuid, 'owner', 'active')
on conflict (organization_id, user_id) do update set
  role = excluded.role,
  status = 'active';

insert into public.articles (organization_id, artigo, descricao, pvp1, pvp2, pvp3, codigo_barras, search_terms)
values
  (current_setting('test.org_a')::uuid, 'RLS-BASELINE-ARTICLE-A', 'Artigo tenant A', '1,00', 1.00, '', '5600000000101', 'tenant a'),
  (current_setting('test.org_b')::uuid, 'RLS-BASELINE-ARTICLE-B', 'Artigo tenant B', '2,00', 2.00, '', '5600000000102', 'tenant b')
on conflict (artigo) do update set
  organization_id = excluded.organization_id,
  descricao = excluded.descricao,
  pvp1 = excluded.pvp1,
  pvp2 = excluded.pvp2,
  pvp3 = excluded.pvp3,
  codigo_barras = excluded.codigo_barras,
  search_terms = excluded.search_terms;

insert into public.campaigns (id, organization_id, titulo, dados, store, origem, created_by, created_by_email, total_artigos)
values
  ('rls-baseline-campaign-a', current_setting('test.org_a')::uuid, 'Campanha tenant A', '[]'::jsonb, '', 'rls-baseline-test', 'RLS', 'a@example.test', 0),
  ('rls-baseline-campaign-b', current_setting('test.org_b')::uuid, 'Campanha tenant B', '[]'::jsonb, '', 'rls-baseline-test', 'RLS', 'b@example.test', 0)
on conflict (id) do update set
  organization_id = excluded.organization_id,
  titulo = excluded.titulo,
  origem = excluded.origem;

-- User A context.
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.user_a'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.user_a'), 'role', 'authenticated')::text, true);

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.articles
  where artigo in ('RLS-BASELINE-ARTICLE-A', 'RLS-BASELINE-ARTICLE-B');

  if v_count <> 1 then
    raise exception 'RLS FAIL: User A sees % baseline articles; expected 1.', v_count;
  end if;

  select count(*) into v_count
  from public.articles
  where artigo = 'RLS-BASELINE-ARTICLE-A';

  if v_count <> 1 then
    raise exception 'RLS FAIL: User A cannot see own article.';
  end if;

  select count(*) into v_count
  from public.campaigns
  where id in ('rls-baseline-campaign-a', 'rls-baseline-campaign-b');

  if v_count <> 1 then
    raise exception 'RLS FAIL: User A sees % baseline campaigns; expected 1.', v_count;
  end if;

  if not public.is_org_member(current_setting('test.org_a')::uuid) then
    raise exception 'RLS FAIL: User A is not recognized as org A member.';
  end if;

  if public.is_org_member(current_setting('test.org_b')::uuid) then
    raise exception 'RLS FAIL: User A is recognized as org B member.';
  end if;

  if public.is_org_member(public.storage_object_org_id(current_setting('test.org_b') || '/2026/test.pdf')) then
    raise exception 'RLS FAIL: User A can access org B storage namespace.';
  end if;
end $$;

-- User B context.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.user_b'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.user_b'), 'role', 'authenticated')::text, true);

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.articles
  where artigo in ('RLS-BASELINE-ARTICLE-A', 'RLS-BASELINE-ARTICLE-B');

  if v_count <> 1 then
    raise exception 'RLS FAIL: User B sees % baseline articles; expected 1.', v_count;
  end if;

  select count(*) into v_count
  from public.articles
  where artigo = 'RLS-BASELINE-ARTICLE-B';

  if v_count <> 1 then
    raise exception 'RLS FAIL: User B cannot see own article.';
  end if;

  select count(*) into v_count
  from public.campaigns
  where id in ('rls-baseline-campaign-a', 'rls-baseline-campaign-b');

  if v_count <> 1 then
    raise exception 'RLS FAIL: User B sees % baseline campaigns; expected 1.', v_count;
  end if;

  if not public.is_org_member(current_setting('test.org_b')::uuid) then
    raise exception 'RLS FAIL: User B is not recognized as org B member.';
  end if;

  if public.is_org_member(current_setting('test.org_a')::uuid) then
    raise exception 'RLS FAIL: User B is recognized as org A member.';
  end if;

  if public.is_org_member(public.storage_object_org_id(current_setting('test.org_a') || '/2026/test.pdf')) then
    raise exception 'RLS FAIL: User B can access org A storage namespace.';
  end if;
end $$;

reset role;
rollback;

select 'MULTI-TENANT RLS BASELINE TEST: OK' as result;
