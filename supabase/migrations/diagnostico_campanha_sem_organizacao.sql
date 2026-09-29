-- Apenas leitura. Executar integralmente e enviar o resultado JSON.
-- Nao altera campanhas, permissoes ou destinatarios; nao consulta emails.
with alvo as (
  select id, source_type, source_campaign_id, organization_id, store, status
  from public.campaign_end_events_v4
  where id = 'ddec3d28-7544-4e41-b678-dde92a9e9dba'::uuid
), campanha as (
  select c.id, c.user_id, c.organization_id, c.store
  from public.campaigns c
  where c.id = 'camp-1790689126132'
), autor as (
  select p.id, p.store, p.default_organization_id
  from public.profiles p
  where p.id in (select user_id from campanha)
), vinculos as (
  select m.organization_id, m.user_id, m.store_id, m.status, m.role
  from public.organization_members m
  where m.user_id in (select user_id from campanha)
), lojas as (
  select s.id, s.organization_id, s.name, s.code, s.status
  from public.stores s
  where s.organization_id in (select organization_id from vinculos)
     or s.id in (select store_id from vinculos)
     or s.organization_id in (select default_organization_id from autor)
     or lower(trim(s.name)) = 'loja da praia'
     or lower(trim(s.code)) = 'praia'
)
select jsonb_pretty(jsonb_build_object(
  'evento', coalesce((select jsonb_agg(to_jsonb(a)) from alvo a), '[]'::jsonb),
  'campanha', coalesce((select jsonb_agg(to_jsonb(c)) from campanha c), '[]'::jsonb),
  'perfil_autor', coalesce((select jsonb_agg(to_jsonb(p)) from autor p), '[]'::jsonb),
  'vinculos_autor', coalesce((select jsonb_agg(to_jsonb(m)) from vinculos m), '[]'::jsonb),
  'lojas_relacionadas', coalesce((select jsonb_agg(to_jsonb(s)) from lojas s), '[]'::jsonb),
  'organizacoes', coalesce((select jsonb_agg(jsonb_build_object(
    'id', o.id, 'name', o.name, 'status', o.status,
    'membros_ativos_com_perfil_praia', (
      select count(distinct m.user_id)
      from public.organization_members m
      join public.profiles p on p.id = m.user_id
      where m.organization_id = o.id and m.status = 'active'
        and lower(coalesce(p.store, '')) like '%praia%'
    )
  )) from public.organizations o), '[]'::jsonb),
  'funcao_v2_instalada', exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'promopilot_campaign_author_organization'
      and p.prosrc like '%array_agg(organization_id)%'
  )
)) as diagnostico;
