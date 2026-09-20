-- PromoPilot · Campaign Lifecycle Notifications
-- Notifica, uma única vez, os colaboradores da Loja da Praia quando uma campanha termina.
-- Mantém a campanha disponível para consulta durante 30 dias após o fim.

create or replace function public.promopilot_try_campaign_date(
  p_value text,
  p_fallback_year integer,
  p_created_at timestamptz
)
returns date
language plpgsql
stable
as $$
declare
  v text := trim(coalesce(p_value, ''));
  y integer;
  m integer;
  d integer;
  created_year integer := extract(year from (p_created_at at time zone 'Atlantic/Azores'))::integer;
  created_month integer := extract(month from (p_created_at at time zone 'Atlantic/Azores'))::integer;
begin
  if v = '' then
    return null;
  end if;

  if v ~ '^[0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}' then
    y := substring(v from '^([0-9]{4})')::integer;
    m := substring(v from '^[0-9]{4}[-/.]([0-9]{1,2})')::integer;
    d := substring(v from '^[0-9]{4}[-/.][0-9]{1,2}[-/.]([0-9]{1,2})')::integer;
  elsif v ~ '^[0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4}' then
    d := substring(v from '^([0-9]{1,2})')::integer;
    m := substring(v from '^[0-9]{1,2}[-/.]([0-9]{1,2})')::integer;
    y := substring(v from '^[0-9]{1,2}[-/.][0-9]{1,2}[-/.]([0-9]{2,4})')::integer;
    if y < 100 then y := y + 2000; end if;
  elsif v ~ '^[0-9]{1,2}[-/.][0-9]{1,2}($|[^0-9])' then
    d := substring(v from '^([0-9]{1,2})')::integer;
    m := substring(v from '^[0-9]{1,2}[-/.]([0-9]{1,2})')::integer;
    y := coalesce(nullif(p_fallback_year, 0), created_year);

    -- Campanhas criadas no fim do ano podem terminar em jan/fev do ano seguinte.
    if created_month >= 10 and m <= 3 and make_date(y, m, d) < (p_created_at at time zone 'Atlantic/Azores')::date and y <= created_year then
      y := created_year + 1;
    end if;
  else
    return null;
  end if;

  return make_date(y, m, d);
exception when others then
  return null;
end;
$$;

alter table public.campaigns
  add column if not exists campaign_end_at timestamptz,
  add column if not exists end_notification_status text not null default 'pending',
  add column if not exists end_notification_sent_at timestamptz,
  add column if not exists end_notification_message_id text not null default '',
  add column if not exists end_notification_error text not null default '',
  add column if not exists end_notification_attempts integer not null default 0,
  add column if not exists end_notification_last_attempt_at timestamptz,
  add column if not exists end_notification_recipients jsonb not null default '[]'::jsonb;

alter table public.automatic_campaigns
  add column if not exists campaign_end_at timestamptz,
  add column if not exists end_notification_status text not null default 'pending',
  add column if not exists end_notification_sent_at timestamptz,
  add column if not exists end_notification_message_id text not null default '',
  add column if not exists end_notification_error text not null default '',
  add column if not exists end_notification_attempts integer not null default 0,
  add column if not exists end_notification_last_attempt_at timestamptz,
  add column if not exists end_notification_recipients jsonb not null default '[]'::jsonb;

-- Backfill da data final com base no maior DATA FIM dos artigos guardados.
update public.campaigns c
set campaign_end_at = (
  select (
    max(public.promopilot_try_campaign_date(
      item->>'dataFim',
      c.ano_validade,
      c.created_at
    )) + time '23:59:59'
  ) at time zone 'Atlantic/Azores'
  from jsonb_array_elements(coalesce(c.dados, '[]'::jsonb)) item
)
where c.campaign_end_at is null;

update public.automatic_campaigns c
set campaign_end_at = (
  select (
    max(public.promopilot_try_campaign_date(
      item->>'dataFim',
      c.ano_validade,
      c.created_at
    )) + time '23:59:59'
  ) at time zone 'Atlantic/Azores'
  from jsonb_array_elements(coalesce(c.dados, '[]'::jsonb)) item
)
where c.campaign_end_at is null;

-- Não dispara emails retroativos para campanhas que já tinham terminado antes deste rollout.
update public.campaigns
set end_notification_status = case
  when lower(store) not like '%praia%' then 'skipped'
  when campaign_end_at is null then 'skipped'
  when campaign_end_at < now() then 'skipped'
  else 'pending'
end
where end_notification_sent_at is null;

update public.automatic_campaigns
set end_notification_status = case
  when lower(store) not like '%praia%' then 'skipped'
  when campaign_end_at is null then 'skipped'
  when campaign_end_at < now() then 'skipped'
  else 'pending'
end
where end_notification_sent_at is null;

-- Uma campanha com data final continua consultável por 30 dias após terminar.
update public.campaigns
set expires_at = greatest(expires_at, campaign_end_at + interval '30 days')
where campaign_end_at is not null
  and lower(store) like '%praia%';

update public.automatic_campaigns
set expires_at = greatest(expires_at, campaign_end_at + interval '30 days')
where campaign_end_at is not null
  and lower(store) like '%praia%';

create index if not exists campaigns_end_notification_due_idx
  on public.campaigns (campaign_end_at, end_notification_status)
  where campaign_end_at is not null;

create index if not exists automatic_campaigns_end_notification_due_idx
  on public.automatic_campaigns (campaign_end_at, end_notification_status)
  where campaign_end_at is not null;

create index if not exists profiles_praia_notification_idx
  on public.profiles (store, id);

-- Checks adicionados de forma idempotente.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaigns_end_notification_status_check'
      and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_end_notification_status_check
      check (end_notification_status in ('pending','processing','sent','error','skipped'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'automatic_campaigns_end_notification_status_check'
      and conrelid = 'public.automatic_campaigns'::regclass
  ) then
    alter table public.automatic_campaigns
      add constraint automatic_campaigns_end_notification_status_check
      check (end_notification_status in ('pending','processing','sent','error','skipped'));
  end if;
end $$;


-- A função acima é apenas auxiliar de migração; não fica exposta na aplicação.
drop function if exists public.promopilot_try_campaign_date(text, integer, timestamptz);
