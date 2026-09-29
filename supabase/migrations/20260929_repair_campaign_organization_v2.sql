-- V2: substitui a primeira versao, que continha uma agregacao UUID invalida.
-- EXECUCAO: abrir uma nova consulta no Supabase SQL Editor, colar TODO este
-- ficheiro e executar sem selecionar apenas uma parte do texto.
-- Executar depois de 20260929_repair_missing_stores.sql e da migration V4.
-- Revisao: array_agg e compativel com UUID; min(uuid) nao e usado.
-- Resolve only a unique, active organization explicitly linked to the author
-- and the campaign's store. Ambiguous campaigns remain blocked from delivery.
begin;

create or replace function public.promopilot_campaign_author_organization(
  p_user_id uuid, p_store text
) returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_count integer;
begin
  if p_user_id is null or nullif(trim(p_store), '') is null then
    return null;
  end if;

  select count(*), (array_agg(organization_id))[1]
  into v_count, v_organization_id
  from (
    select distinct om.organization_id
    from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    left join public.stores s on s.organization_id = om.organization_id
      and s.status = 'active'
      and (lower(trim(s.name)) = lower(trim(p_store))
        or lower(trim(s.code)) = lower(trim(p_store)))
    left join public.profiles p on p.id = om.user_id
    where om.user_id = p_user_id
      and om.status = 'active'
      and o.status = 'active'
      and (
        (s.id is not null and (om.store_id is null or om.store_id = s.id))
        or (p.default_organization_id = om.organization_id
          and lower(trim(coalesce(p.store, ''))) = lower(trim(p_store))
          and (om.store_id is null or om.store_id = s.id))
      )
  ) matches;

  if v_count = 1 then return v_organization_id; end if;
  return null;
end;
$$;

revoke all on function public.promopilot_campaign_author_organization(uuid,text)
  from public, anon, authenticated;

create or replace function public.promopilot_set_campaign_organization()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.organization_id is null then
    new.organization_id := public.promopilot_campaign_author_organization(new.user_id, new.store);
  end if;
  return new;
end;
$$;

drop trigger if exists promopilot_set_campaign_organization on public.campaigns;
create trigger promopilot_set_campaign_organization
before insert or update of user_id, store, organization_id on public.campaigns
for each row execute function public.promopilot_set_campaign_organization();

drop trigger if exists promopilot_set_campaign_organization on public.automatic_campaigns;
create trigger promopilot_set_campaign_organization
before insert or update of user_id, store, organization_id on public.automatic_campaigns
for each row execute function public.promopilot_set_campaign_organization();

-- Updating the source campaign fires the V4 capture trigger and repairs its
-- unsent event. Existing sent/processing events remain untouched by V4.
update public.campaigns c
set organization_id = public.promopilot_campaign_author_organization(c.user_id, c.store)
where c.organization_id is null
  and public.promopilot_campaign_author_organization(c.user_id, c.store) is not null;

update public.automatic_campaigns c
set organization_id = public.promopilot_campaign_author_organization(c.user_id, c.store)
where c.organization_id is null
  and public.promopilot_campaign_author_organization(c.user_id, c.store) is not null;

-- Reconcile pre-existing V4 events that may not have been refreshed because
-- their source campaign already had an organization before this repair.
update public.campaign_end_events_v4 e
set organization_id = c.organization_id, last_error = '',
    status = 'pending', next_attempt_at = greatest(e.due_at, now())
from public.campaigns c
where e.source_type = 'manual' and e.source_campaign_id = c.id
  and e.organization_id is null and c.organization_id is not null
  and e.status in ('pending', 'waiting_recipients', 'failed')
  and not exists (select 1 from public.campaign_end_event_deliveries_v4 d where d.event_id = e.id);

update public.campaign_end_events_v4 e
set organization_id = c.organization_id, last_error = '',
    status = 'pending', next_attempt_at = greatest(e.due_at, now())
from public.automatic_campaigns c
where e.source_type = 'automatic' and e.source_campaign_id = c.id
  and e.organization_id is null and c.organization_id is not null
  and e.status in ('pending', 'waiting_recipients', 'failed')
  and not exists (select 1 from public.campaign_end_event_deliveries_v4 d where d.event_id = e.id);

commit;

-- Verification: unresolved rows must remain blocked; inspect these manually.
select e.id, e.source_type, e.source_campaign_id, e.store, e.status
from public.campaign_end_events_v4 e
where e.organization_id is null and e.status in ('pending','waiting_recipients','failed');
