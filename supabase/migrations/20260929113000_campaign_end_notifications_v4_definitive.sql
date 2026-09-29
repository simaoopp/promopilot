-- PromoPilot · Campaign End Notifications · V4 definitive
-- One canonical outbox + one canonical delivery ledger.
-- Replaces the previous campaign-end trigger experiments without deleting legacy data.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.promopilot_v4_normalize_text(p_value text)
returns text
language sql
immutable
as $$
  select lower(
    regexp_replace(
      translate(
        trim(coalesce(p_value, '')),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
        'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.promopilot_v4_is_praia_store(p_store text)
returns boolean
language sql
immutable
as $$
  select position('praia' in public.promopilot_v4_normalize_text(p_store)) > 0;
$$;

create or replace function public.promopilot_v4_parse_campaign_date(
  p_value text,
  p_year_hint integer
)
returns date
language plpgsql
stable
as $$
declare
  v text := lower(trim(coalesce(p_value, '')));
  v_parts text[];
  v_day integer;
  v_month integer;
  v_year integer;
  v_mon text;
begin
  if v = '' or v = '-' then return null; end if;
  v := replace(v, '.', '');

  if v ~ '^[0-9]{4}[-/.][0-9]{1,2}[-/.][0-9]{1,2}$' then
    v_parts := regexp_split_to_array(v, '[-/.]');
    return make_date(v_parts[1]::integer, v_parts[2]::integer, v_parts[3]::integer);
  end if;

  if v ~ '^[0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{4}$' then
    v_parts := regexp_split_to_array(v, '[-/.]');
    return make_date(v_parts[3]::integer, v_parts[2]::integer, v_parts[1]::integer);
  end if;

  if v ~ '^[0-9]{1,2}[-/.][0-9]{1,2}$' then
    v_parts := regexp_split_to_array(v, '[-/.]');
    v_year := coalesce(nullif(p_year_hint, 0), extract(year from current_date)::integer);
    return make_date(v_year, v_parts[2]::integer, v_parts[1]::integer);
  end if;

  if v ~ '^[0-9]{1,2}/[[:alpha:]]{3}(/[0-9]{4})?$' then
    v_parts := string_to_array(v, '/');
    v_day := v_parts[1]::integer;
    v_mon := public.promopilot_v4_normalize_text(v_parts[2]);
    v_month := case v_mon
      when 'jan' then 1 when 'fev' then 2 when 'feb' then 2
      when 'mar' then 3 when 'abr' then 4 when 'apr' then 4
      when 'mai' then 5 when 'may' then 5 when 'jun' then 6
      when 'jul' then 7 when 'ago' then 8 when 'aug' then 8
      when 'set' then 9 when 'sep' then 9 when 'out' then 10
      when 'oct' then 10 when 'nov' then 11 when 'dez' then 12
      when 'dec' then 12 else null
    end;
    if v_month is null then return null; end if;
    v_year := case
      when array_length(v_parts, 1) >= 3 then v_parts[3]::integer
      else coalesce(nullif(p_year_hint, 0), extract(year from current_date)::integer)
    end;
    return make_date(v_year, v_month, v_day);
  end if;

  return null;
exception when others then
  return null;
end;
$$;

create or replace function public.promopilot_v4_campaign_end_date(
  p_items jsonb,
  p_year_hint integer,
  p_title text
)
returns date
language plpgsql
stable
as $$
declare
  v_item jsonb;
  v_end date;
  v_max date := null;
  v_title text;
begin
  v_title := upper(public.promopilot_v4_normalize_text(p_title));

  if v_title = 'ARTIGO C/DEFEITO' then
    return null;
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    return null;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_end := public.promopilot_v4_parse_campaign_date(
      coalesce(
        v_item ->> 'dataFim',
        v_item ->> 'data_fim',
        v_item ->> 'DATA FIM',
        v_item ->> 'DATA_FIM',
        v_item ->> 'endDate',
        v_item ->> 'validadeFim',
        ''
      ),
      p_year_hint
    );

    if v_end is not null and (v_max is null or v_end > v_max) then
      v_max := v_end;
    end if;
  end loop;

  return v_max;
end;
$$;

-- ---------------------------------------------------------------------------
-- Canonical outbox + delivery ledger
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_end_events_v4 (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('manual', 'automatic')),
  source_campaign_id text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  store text not null default '',
  title text not null default 'Campanha',
  items jsonb not null default '[]'::jsonb,
  campaign_year integer,
  label_format text not null default '',
  origin text not null default '',
  total_items integer not null default 0 check (total_items >= 0),
  campaign_created_at timestamptz,
  end_date date not null,
  due_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','partial','failed','waiting_recipients','skipped')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  locked_at timestamptz,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_campaign_id, end_date)
);

create index if not exists campaign_end_events_v4_due_idx
  on public.campaign_end_events_v4 (status, due_at, next_attempt_at)
  where status <> 'sent';

create index if not exists campaign_end_events_v4_org_store_idx
  on public.campaign_end_events_v4 (organization_id, store, end_date desc);

create table if not exists public.campaign_end_event_deliveries_v4 (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.campaign_end_events_v4(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_email text not null,
  recipient_name text not null default '',
  status text not null default 'pending'
    check (status in ('pending','sending','sent','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_message_id text not null default '',
  last_error text not null default '',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, recipient_email)
);

create index if not exists campaign_end_event_deliveries_v4_event_idx
  on public.campaign_end_event_deliveries_v4 (event_id, status);

create index if not exists campaign_end_event_deliveries_v4_recipient_idx
  on public.campaign_end_event_deliveries_v4 (recipient_email, created_at desc);

alter table public.campaign_end_events_v4 enable row level security;
alter table public.campaign_end_event_deliveries_v4 enable row level security;

revoke all on public.campaign_end_events_v4 from anon, authenticated;
revoke all on public.campaign_end_event_deliveries_v4 from anon, authenticated;
grant select, insert, update, delete on public.campaign_end_events_v4 to service_role;
grant select, insert, update, delete on public.campaign_end_event_deliveries_v4 to service_role;

create or replace function public.promopilot_v4_touch_campaign_end_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Remove every legacy campaign-end trigger known from the repository and the
-- current production trigger list. Legacy tables/data are preserved.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.campaigns') is not null then
    execute 'drop trigger if exists capture_manual_campaign_end_notification on public.campaigns';
    execute 'drop trigger if exists sync_campaign_lifecycle on public.campaigns';
    execute 'drop trigger if exists trg_campaigns_campaign_end_notification on public.campaigns';
    execute 'drop trigger if exists campaigns_capture_end_notification on public.campaigns';
    execute 'drop trigger if exists promopilot_v3_sync_campaign_lifecycle on public.campaigns';
    execute 'drop trigger if exists promopilot_v4_capture_campaign_end_manual on public.campaigns';
    execute 'drop trigger if exists promopilot_v4_cancel_campaign_end_manual on public.campaigns';
  end if;

  if to_regclass('public.automatic_campaigns') is not null then
    execute 'drop trigger if exists capture_automatic_campaign_end_notification on public.automatic_campaigns';
    execute 'drop trigger if exists sync_automatic_campaign_lifecycle on public.automatic_campaigns';
    execute 'drop trigger if exists trg_automatic_campaigns_campaign_end_notification on public.automatic_campaigns';
    execute 'drop trigger if exists automatic_campaigns_capture_end_notification on public.automatic_campaigns';
    execute 'drop trigger if exists promopilot_v3_sync_automatic_campaign_lifecycle on public.automatic_campaigns';
    execute 'drop trigger if exists promopilot_v4_capture_campaign_end_automatic on public.automatic_campaigns';
    execute 'drop trigger if exists promopilot_v4_cancel_campaign_end_automatic on public.automatic_campaigns';
  end if;

  if to_regclass('public.campaign_end_notifications') is not null then
    execute 'drop trigger if exists campaign_end_notifications_sync_ids on public.campaign_end_notifications';
    execute 'drop trigger if exists trg_campaign_end_source_id on public.campaign_end_notifications';
    execute 'drop trigger if exists campaign_end_notifications_touch_updated_at on public.campaign_end_notifications';
    execute 'drop trigger if exists trg_campaign_end_notifications_updated_at on public.campaign_end_notifications';
  end if;

  if to_regclass('public.campaign_end_notification_deliveries') is not null then
    execute 'drop trigger if exists campaign_end_notification_delivery_updated_at on public.campaign_end_notification_deliveries';
    execute 'drop trigger if exists campaign_end_deliveries_touch_updated_at on public.campaign_end_notification_deliveries';
  end if;
end
$$;

-- Updated-at triggers only on the canonical V4 tables.
drop trigger if exists promopilot_v4_campaign_end_event_updated_at
  on public.campaign_end_events_v4;
create trigger promopilot_v4_campaign_end_event_updated_at
before update on public.campaign_end_events_v4
for each row execute function public.promopilot_v4_touch_campaign_end_updated_at();

drop trigger if exists promopilot_v4_campaign_end_delivery_updated_at
  on public.campaign_end_event_deliveries_v4;
create trigger promopilot_v4_campaign_end_delivery_updated_at
before update on public.campaign_end_event_deliveries_v4
for each row execute function public.promopilot_v4_touch_campaign_end_updated_at();

-- ---------------------------------------------------------------------------
-- One canonical capture trigger for both source tables.
-- It only snapshots Praia campaigns with a real DATA FIM.
-- ---------------------------------------------------------------------------
create or replace function public.promopilot_v4_capture_campaign_end_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_source_type text;
  v_source_id text;
  v_org uuid;
  v_store text;
  v_title text;
  v_items jsonb;
  v_year integer;
  v_format text;
  v_origin text;
  v_total integer;
  v_created_at timestamptz;
  v_end_date date;
  v_due_at timestamptz;
begin
  v_source_type := case when tg_table_name = 'automatic_campaigns' then 'automatic' else 'manual' end;
  v_source_id := nullif(v_row ->> 'id', '');
  v_store := coalesce(v_row ->> 'store', '');
  v_title := coalesce(nullif(trim(v_row ->> 'titulo'), ''), 'Campanha');
  v_items := case
    when jsonb_typeof(v_row -> 'dados') = 'array' then v_row -> 'dados'
    else '[]'::jsonb
  end;
  v_year := coalesce(nullif(v_row ->> 'ano_validade', '')::integer, extract(year from current_date)::integer);
  v_format := coalesce(v_row ->> 'formato_etiqueta', '');
  v_origin := coalesce(v_row ->> 'origem', v_source_type);
  v_total := greatest(
    coalesce(nullif(v_row ->> 'total_artigos', '')::integer, 0),
    jsonb_array_length(v_items)
  );
  v_created_at := nullif(v_row ->> 'created_at', '')::timestamptz;
  v_org := nullif(v_row ->> 'organization_id', '')::uuid;
  v_end_date := public.promopilot_v4_campaign_end_date(v_items, v_year, v_title);

  if v_source_id is null then
    return new;
  end if;

  if not public.promopilot_v4_is_praia_store(v_store) then
    update public.campaign_end_events_v4
    set status = 'skipped',
        locked_at = null,
        last_error = 'Loja fora do âmbito das notificações de fim de campanha.'
    where source_type = v_source_type
      and source_campaign_id = v_source_id
      and status <> 'sent';
    return new;
  end if;

  if v_end_date is null then
    update public.campaign_end_events_v4
    set status = 'skipped',
        locked_at = null,
        last_error = 'Campanha sem DATA FIM válida.'
    where source_type = v_source_type
      and source_campaign_id = v_source_id
      and status <> 'sent';
    return new;
  end if;

  -- A campanha só terminou depois de acabar o dia DATA FIM nos Açores.
  v_due_at := ((v_end_date + 1)::timestamp at time zone 'Atlantic/Azores');

  -- Se a DATA FIM foi alterada, cancela eventos anteriores ainda não enviados.
  update public.campaign_end_events_v4
  set status = 'skipped',
      locked_at = null,
      last_error = 'Substituída por uma nova DATA FIM da campanha.'
  where source_type = v_source_type
    and source_campaign_id = v_source_id
    and end_date <> v_end_date
    and status <> 'sent';

  insert into public.campaign_end_events_v4 (
    source_type,
    source_campaign_id,
    organization_id,
    store,
    title,
    items,
    campaign_year,
    label_format,
    origin,
    total_items,
    campaign_created_at,
    end_date,
    due_at,
    status,
    next_attempt_at,
    last_error
  )
  values (
    v_source_type,
    v_source_id,
    v_org,
    v_store,
    v_title,
    v_items,
    v_year,
    v_format,
    v_origin,
    v_total,
    v_created_at,
    v_end_date,
    v_due_at,
    'pending',
    v_due_at,
    ''
  )
  on conflict (source_type, source_campaign_id, end_date)
  do update set
    organization_id = case when public.campaign_end_events_v4.status in ('sent','processing') then public.campaign_end_events_v4.organization_id else excluded.organization_id end,
    store = case when public.campaign_end_events_v4.status in ('sent','processing') then public.campaign_end_events_v4.store else excluded.store end,
    title = case when public.campaign_end_events_v4.status in ('sent','processing') then public.campaign_end_events_v4.title else excluded.title end,
    items = case when public.campaign_end_events_v4.status in ('sent','processing') then public.campaign_end_events_v4.items else excluded.items end,
    campaign_year = case when public.campaign_end_events_v4.status in ('sent','processing') then public.campaign_end_events_v4.campaign_year else excluded.campaign_year end,
    label_format = case when public.campaign_end_events_v4.status in ('sent','processing') then public.campaign_end_events_v4.label_format else excluded.label_format end,
    origin = case when public.campaign_end_events_v4.status in ('sent','processing') then public.campaign_end_events_v4.origin else excluded.origin end,
    total_items = case when public.campaign_end_events_v4.status in ('sent','processing') then public.campaign_end_events_v4.total_items else excluded.total_items end,
    campaign_created_at = case when public.campaign_end_events_v4.status in ('sent','processing') then public.campaign_end_events_v4.campaign_created_at else excluded.campaign_created_at end,
    due_at = case when public.campaign_end_events_v4.status in ('sent','processing') then public.campaign_end_events_v4.due_at else excluded.due_at end,
    status = case
      when public.campaign_end_events_v4.status in ('sent','processing')
        then public.campaign_end_events_v4.status
      else 'pending'
    end,
    next_attempt_at = case
      when public.campaign_end_events_v4.status in ('sent','processing')
        then public.campaign_end_events_v4.next_attempt_at
      else excluded.due_at
    end,
    locked_at = case
      when public.campaign_end_events_v4.status = 'processing'
        then public.campaign_end_events_v4.locked_at
      else null
    end,
    last_error = case
      when public.campaign_end_events_v4.status in ('sent','processing')
        then public.campaign_end_events_v4.last_error
      else ''
    end;

  return new;
end;
$$;

create trigger promopilot_v4_capture_campaign_end_manual
after insert or update of titulo, dados, ano_validade, store, organization_id, formato_etiqueta, origem, total_artigos
on public.campaigns
for each row execute function public.promopilot_v4_capture_campaign_end_event();

create trigger promopilot_v4_capture_campaign_end_automatic
after insert or update of titulo, dados, ano_validade, store, organization_id, formato_etiqueta, origem, total_artigos
on public.automatic_campaigns
for each row execute function public.promopilot_v4_capture_campaign_end_event();

create or replace function public.promopilot_v4_cancel_campaign_end_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_type text := case when tg_table_name = 'automatic_campaigns' then 'automatic' else 'manual' end;
  v_source_id text := nullif(to_jsonb(old) ->> 'id', '');
begin
  if v_source_id is not null then
    update public.campaign_end_events_v4
    set status = 'skipped',
        locked_at = null,
        last_error = 'Campanha removida antes da notificação de fim.'
    where source_type = v_source_type
      and source_campaign_id = v_source_id
      and status <> 'sent';
  end if;
  return old;
end;
$$;

create trigger promopilot_v4_cancel_campaign_end_manual
after delete on public.campaigns
for each row execute function public.promopilot_v4_cancel_campaign_end_event();

create trigger promopilot_v4_cancel_campaign_end_automatic
after delete on public.automatic_campaigns
for each row execute function public.promopilot_v4_cancel_campaign_end_event();

-- ---------------------------------------------------------------------------
-- Atomic claim for Cloud Run Job / concurrent workers.
-- ---------------------------------------------------------------------------
create or replace function public.claim_campaign_end_events_v4(
  p_limit integer default 25,
  p_max_attempts integer default 24
)
returns setof public.campaign_end_events_v4
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select e.id
    from public.campaign_end_events_v4 e
    where e.due_at <= now()
      and coalesce(e.next_attempt_at, e.due_at) <= now()
      and e.attempt_count < greatest(1, least(coalesce(p_max_attempts, 24), 100))
      and (
        e.status in ('pending','failed','partial','waiting_recipients')
        or (
          e.status = 'processing'
          and e.locked_at < now() - interval '20 minutes'
        )
      )
    order by e.due_at asc, e.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update public.campaign_end_events_v4 e
  set status = 'processing',
      attempt_count = e.attempt_count + 1,
      locked_at = now(),
      last_attempt_at = now(),
      last_error = ''
  from due
  where e.id = due.id
  returning e.*;
end;
$$;

revoke all on function public.claim_campaign_end_events_v4(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_campaign_end_events_v4(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Safe backfill: only campaigns whose DATA FIM is today or in the future.
-- This deliberately prevents a historical email flood after deployment.
-- ---------------------------------------------------------------------------
insert into public.campaign_end_events_v4 (
  source_type, source_campaign_id, organization_id, store, title, items,
  campaign_year, label_format, origin, total_items, campaign_created_at,
  end_date, due_at, status, next_attempt_at
)
select
  'manual',
  c.id::text,
  c.organization_id,
  coalesce(c.store, ''),
  coalesce(nullif(trim(c.titulo), ''), 'Campanha'),
  coalesce(c.dados, '[]'::jsonb),
  coalesce(c.ano_validade, extract(year from current_date)::integer),
  coalesce(c.formato_etiqueta, ''),
  coalesce(c.origem, 'manual'),
  greatest(
    coalesce(c.total_artigos, 0),
    case when jsonb_typeof(coalesce(c.dados, '[]'::jsonb)) = 'array' then jsonb_array_length(coalesce(c.dados, '[]'::jsonb)) else 0 end
  ),
  c.created_at,
  public.promopilot_v4_campaign_end_date(c.dados, c.ano_validade, c.titulo),
  ((public.promopilot_v4_campaign_end_date(c.dados, c.ano_validade, c.titulo) + 1)::timestamp at time zone 'Atlantic/Azores'),
  'pending',
  ((public.promopilot_v4_campaign_end_date(c.dados, c.ano_validade, c.titulo) + 1)::timestamp at time zone 'Atlantic/Azores')
from public.campaigns c
where public.promopilot_v4_is_praia_store(c.store)
  and public.promopilot_v4_campaign_end_date(c.dados, c.ano_validade, c.titulo) >= current_date
on conflict (source_type, source_campaign_id, end_date) do nothing;

insert into public.campaign_end_events_v4 (
  source_type, source_campaign_id, organization_id, store, title, items,
  campaign_year, label_format, origin, total_items, campaign_created_at,
  end_date, due_at, status, next_attempt_at
)
select
  'automatic',
  c.id::text,
  c.organization_id,
  coalesce(c.store, ''),
  coalesce(nullif(trim(c.titulo), ''), 'Campanha automática'),
  coalesce(c.dados, '[]'::jsonb),
  coalesce(c.ano_validade, extract(year from current_date)::integer),
  coalesce(c.formato_etiqueta, ''),
  coalesce(c.origem, 'automatico-email'),
  greatest(
    coalesce(c.total_artigos, 0),
    case when jsonb_typeof(coalesce(c.dados, '[]'::jsonb)) = 'array' then jsonb_array_length(coalesce(c.dados, '[]'::jsonb)) else 0 end
  ),
  c.created_at,
  public.promopilot_v4_campaign_end_date(c.dados, c.ano_validade, c.titulo),
  ((public.promopilot_v4_campaign_end_date(c.dados, c.ano_validade, c.titulo) + 1)::timestamp at time zone 'Atlantic/Azores'),
  'pending',
  ((public.promopilot_v4_campaign_end_date(c.dados, c.ano_validade, c.titulo) + 1)::timestamp at time zone 'Atlantic/Azores')
from public.automatic_campaigns c
where public.promopilot_v4_is_praia_store(c.store)
  and public.promopilot_v4_campaign_end_date(c.dados, c.ano_validade, c.titulo) >= current_date
on conflict (source_type, source_campaign_id, end_date) do nothing;

comment on table public.campaign_end_events_v4 is
  'Canonical durable outbox/snapshot for Praia campaign-end notifications.';
comment on table public.campaign_end_event_deliveries_v4 is
  'Per-recipient idempotent delivery ledger for campaign-end emails.';

select pg_notify('pgrst', 'reload schema');

commit;
