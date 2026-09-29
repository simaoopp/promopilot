-- Correcao baseada no diagnostico fornecido em 29/09/2026.
-- Executar TODO o ficheiro no Supabase SQL Editor.
-- Requer as tabelas stores e V4 ja instaladas. Nao envia emails.
-- Cria apenas o vinculo do autor confirmado, com o papel store_user.
begin;

-- O esquema fornecido nao garante unicidade de organization_members.
-- Serializar a verificacao/insercao torna a reexecucao segura.
lock table public.stores, public.organization_members in share row exclusive mode;

do $repair$
declare
  v_org constant uuid := '48c5f5d5-b92e-45ab-8a99-382906195266';
  v_user constant uuid := '2edfa434-829f-4e8f-ae93-23b096389704';
  v_event constant uuid := 'ddec3d28-7544-4e41-b678-dde92a9e9dba';
  v_campaign constant text := 'camp-1790689126132';
  v_store uuid;
  v_count bigint;
  v_source record;
  v_outbox record;
begin
  perform 1 from public.organizations
  where id = v_org and status = 'active' for share;
  if not found then
    raise exception 'A organizacao Expert nao existe ou nao esta ativa.';
  end if;

  perform 1 from public.profiles
  where id = v_user and default_organization_id = v_org
    and lower(trim(store)) = 'loja da praia' for share;
  if not found then
    raise exception 'O perfil do autor ja nao corresponde ao diagnostico. Nenhum dado foi alterado.';
  end if;

  select * into v_source from public.campaigns where id = v_campaign for update;
  if not found then raise exception 'Campanha de origem inexistente.'; end if;
  if v_source.user_id is distinct from v_user
     or lower(trim(v_source.store)) is distinct from 'loja da praia'
     or (v_source.organization_id is not null and v_source.organization_id <> v_org) then
    raise exception 'A campanha ja nao corresponde ao autor, loja ou organizacao esperados.';
  end if;

  select * into v_outbox from public.campaign_end_events_v4 where id = v_event for update;
  if not found then raise exception 'Evento V4 inexistente.'; end if;
  if v_outbox.source_type <> 'manual'
     or v_outbox.source_campaign_id <> v_campaign
     or lower(trim(v_outbox.store)) is distinct from 'loja da praia'
     or (v_outbox.organization_id is not null and v_outbox.organization_id <> v_org) then
    raise exception 'O evento ja nao corresponde a campanha, loja ou organizacao esperadas.';
  end if;
  if v_outbox.status = 'processing' then
    raise exception 'O worker esta a processar o evento. Repetir depois de terminar.';
  end if;
  if v_outbox.status = 'sent' and v_outbox.organization_id = v_org
     and v_source.organization_id = v_org then
    raise notice 'Campanha ja corrigida e evento enviado; nenhuma alteracao necessaria.';
    return;
  end if;
  if v_outbox.status not in ('pending', 'waiting_recipients', 'failed') then
    raise exception 'Estado do evento nao elegivel para esta reparacao: %', v_outbox.status;
  end if;
  if exists (select 1 from public.campaign_end_event_deliveries_v4
    where event_id = v_event) then
    raise exception 'Existem entregas registadas; e necessario rever antes de alterar o evento.';
  end if;

  select count(*), (array_agg(id))[1] into v_count, v_store
  from public.stores
  where organization_id = v_org
    and (lower(trim(code)) = 'praia' or lower(trim(name)) = 'loja da praia');
  if v_count > 1 then raise exception 'Existem varias lojas Praia na Expert.'; end if;
  if v_count = 0 then
    insert into public.stores (organization_id, code, name, status)
    values (v_org, 'praia', 'Loja da Praia', 'active') returning id into v_store;
  elsif not exists (select 1 from public.stores where id = v_store and status = 'active') then
    raise exception 'A loja existente esta desativada; nao foi reativada automaticamente.';
  end if;

  select count(*) into v_count from public.organization_members
  where organization_id = v_org and user_id = v_user;
  if v_count = 0 then
    insert into public.organization_members (organization_id, user_id, role, store_id, status)
    values (v_org, v_user, 'store_user', v_store, 'active');
  elsif v_count <> 1 or not exists (
    select 1 from public.organization_members
    where organization_id = v_org and user_id = v_user and status = 'active'
      and (store_id is null or store_id = v_store)
  ) then
    raise exception 'O vinculo existente e ambiguo, inativo ou pertence a outra loja.';
  end if;

  update public.campaigns set organization_id = v_org
  where id = v_campaign and organization_id is null;

  -- O trigger V4 pode ja ter atualizado o evento. Garantir a mesma associacao
  -- e libertar apenas este evento para nova tentativa, preservando o seu ID.
  update public.campaign_end_events_v4
  set organization_id = v_org, status = 'pending', last_error = '',
      locked_at = null, next_attempt_at = greatest(due_at, now()), updated_at = now()
  where id = v_event;

  if not exists (select 1 from public.campaigns
    where id = v_campaign and organization_id = v_org) then
    raise exception 'Um trigger impediu a associacao da campanha; transacao anulada.';
  end if;
end;
$repair$;

commit;

-- O evento e a campanha devem apresentar a mesma organization_id da Expert.
select e.id as event_id, e.organization_id as event_organization_id,
       c.organization_id as campaign_organization_id, e.status,
       m.status as membership_status, m.role, s.name as store_name
from public.campaign_end_events_v4 e
join public.campaigns c on c.id = e.source_campaign_id
left join public.organization_members m
  on m.user_id = c.user_id and m.organization_id = c.organization_id
left join public.stores s on s.id = m.store_id
where e.id = 'ddec3d28-7544-4e41-b678-dde92a9e9dba'::uuid;
