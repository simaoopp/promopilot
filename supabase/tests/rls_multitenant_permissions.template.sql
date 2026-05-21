-- Template de teste RLS multi-tenant.
-- Executar apenas em staging, adaptando os UUIDs abaixo.
-- Objetivo: provar que Cliente A não vê Cliente B.

-- 1) Criar ou identificar dois auth.users reais no Supabase Auth.
-- 2) Criar duas organizações.
insert into public.organizations (id, name, slug, status)
values
  ('00000000-0000-4000-8000-0000000000a1', 'Tenant A QA', 'tenant-a-qa', 'active'),
  ('00000000-0000-4000-8000-0000000000b1', 'Tenant B QA', 'tenant-b-qa', 'active')
on conflict (id) do nothing;

-- Substituir estes IDs por auth.users.id reais de staging.
-- insert into public.organization_members (organization_id, user_id, role, status)
-- values
--   ('00000000-0000-4000-8000-0000000000a1', '<USER_A_UUID>', 'owner', 'active'),
--   ('00000000-0000-4000-8000-0000000000b1', '<USER_B_UUID>', 'owner', 'active')
-- on conflict (organization_id, user_id) do update set role = excluded.role, status = 'active';

-- Validação manual com JWT do User A via app/API:
-- Deve ver Tenant A.
-- Não deve ver Tenant B.
-- Não deve conseguir abrir storage path 00000000-0000-4000-8000-0000000000b1/...

-- Validação manual com JWT do User B via app/API:
-- Deve ver Tenant B.
-- Não deve ver Tenant A.
-- Não deve conseguir abrir storage path 00000000-0000-4000-8000-0000000000a1/...
