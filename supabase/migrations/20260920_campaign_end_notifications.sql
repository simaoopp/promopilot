-- PromoPilot · Campaign end notifications
-- Durable lifecycle/outbox independent from the short campaign-history retention.
-- Only campaigns assigned to a Praia store are captured.

create extension if not exists pgcrypto;

create table if not exists public.campaign_end_notifications (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('manual', 'automatic')),
  source_campaign_id text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  title text not null default 'PROMOÇÃO',
  store text not null default '',
  origin text not null default '',
  campaign_year integer not null default extract(year from now())::integer,
  items jsonb not null default '[]'::jsonb,
  total_items integer not null default 0 check (total_items >= 0),
  end_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  notified_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_campaign_id)
);

create index if not exists campaign_end_notifications_due_idx
  on public.campaign_end_notifications (status, end_date, notified_at);

create index if not exists campaign_end_notifications_store_idx
  on public.campaign_end_notifications (store, end_date desc);

create table if not exists public.campaign_end_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null
    references public.campaign_end_notifications(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  display_name text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_message_id text,
  last_error text not null default '',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, email)
);

create index if not exists campaign_end_delivery_notification_idx
  on public.campaign_end_notification_deliveries (notification_id, status);

create or replace function public.campaign_end_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campaign_end_notifications_touch_updated_at
  on public.campaign_end_notifications;
create trigger campaign_end_notifications_touch_updated_at
before update on public.campaign_end_notifications
for each row execute function public.campaign_end_touch_updated_at();

drop trigger if exists campaign_end_deliveries_touch_updated_at
  on public.campaign_end_notification_deliveries;
create trigger campaign_end_deliveries_touch_updated_at
before update on public.campaign_end_notification_deliveries
for each row execute function public.campaign_end_touch_updated_at();

create or replace function public.parse_campaign_date(
  raw_value text,
  fallback_year integer
)
returns date
language plpgsql
immutable
as $$
declare
  raw text := trim(coalesce(raw_value, ''));
  match text[];
  yyyy integer;
  mm integer;
  dd integer;
begin
  if raw = '' or raw = '-' then
    return null;
  end if;

  -- YYYY-MM-DD / YYYY/MM/DD
  match := regexp_match(raw, '^([0-9]{4})[-/]([0-9]{1,2})[-/]([0-9]{1,2})$');
  if match is not null then
    yyyy := match[1]::integer;
    mm := match[2]::integer;
    dd := match[3]::integer;
    return make_date(yyyy, mm, dd);
  end if;

  -- DD/MM/YYYY / DD-MM-YYYY
  match := regexp_match(raw, '^([0-9]{1,2})[-/]([0-9]{1,2})[-/]([0-9]{4})$');
  if match is not null then
    dd := match[1]::integer;
    mm := match[2]::integer;
    yyyy := match[3]::integer;
    return make_date(yyyy, mm, dd);
  end if;

  -- DD/MM / DD-MM
  match := regexp_match(raw, '^([0-9]{1,2})[-/]([0-9]{1,2})$');
  if match is not null then
    dd := match[1]::integer;
    mm := match[2]::integer;
    yyyy := coalesce(nullif(fallback_year, 0), extract(year from now())::integer);
    return make_date(yyyy, mm, dd);
  end if;

  return null;
exception
  when others then
    return null;
end;
$$;

create or replace function public.campaign_end_date_from_items(
  payload jsonb,
  fallback_year integer
)
returns date
language plpgsql
stable
as $$
declare
  item jsonb;
  start_raw text;
  end_raw text;
  start_date date;
  end_date date;
  candidate date;
  max_date date;
  end_has_year boolean;
  effective_year integer := coalesce(nullif(fallback_year, 0), extract(year from now())::integer);
begin
  if payload is null or jsonb_typeof(payload) <> 'array' then
    return null;
  end if;

  for item in select value from jsonb_array_elements(payload)
  loop
    start_raw := coalesce(
      item ->> 'dataInicio',
      item ->> 'data_inicio',
      item ->> 'DATA INICIO',
      item ->> 'DATA INÍCIO',
      ''
    );

    end_raw := coalesce(
      item ->> 'dataFim',
      item ->> 'data_fim',
      item ->> 'DATA FIM',
      ''
    );

    start_date := public.parse_campaign_date(start_raw, effective_year);
    end_date := public.parse_campaign_date(end_raw, effective_year);
    end_has_year := end_raw ~ '[0-9]{4}';

    -- Campaigns spanning New Year: e.g. 20/12 -> 05/01.
    if (
      end_date is not null
      and start_date is not null
      and not end_has_year
      and end_date < start_date
      and extract(month from end_date) < extract(month from start_date)
    ) then
      end_date := public.parse_campaign_date(
        to_char(end_date, 'DD/MM'),
        effective_year + 1
      );
    end if;

    candidate := end_date;

    if candidate is not null and (max_date is null or candidate > max_date) then
      max_date := candidate;
    end if;
  end loop;

  return max_date;
end;
$$;

create or replace function public.capture_campaign_end_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_kind text := TG_ARGV[0];
  calculated_end date;
  org_id uuid;
  row_origin text;
  campaign_title text;
  campaign_store text;
  campaign_year integer;
  campaign_items jsonb;
  campaign_total integer;
begin
  campaign_store := coalesce(new.store, '');

  -- Requirement: lifecycle notification is active only for Praia employees/store.
  if lower(campaign_store) not like '%praia%' then
    delete from public.campaign_end_notifications
    where source_type = source_kind
      and source_campaign_id = new.id::text
      and notified_at is null;
    return new;
  end if;

  campaign_items := coalesce(new.dados, '[]'::jsonb);
  campaign_year := coalesce(new.ano_validade, extract(year from now())::integer);
  calculated_end := public.campaign_end_date_from_items(campaign_items, campaign_year);

  -- Campaigns without an explicit end date are intentionally not scheduled.
  if calculated_end is null then
    delete from public.campaign_end_notifications
    where source_type = source_kind
      and source_campaign_id = new.id::text
      and notified_at is null;
    return new;
  end if;

  campaign_title := coalesce(nullif(trim(new.titulo), ''), 'PROMOÇÃO');
  row_origin := coalesce(new.origem, source_kind);
  campaign_total := greatest(
    coalesce(new.total_artigos, 0),
    jsonb_array_length(campaign_items)
  );

  begin
    org_id := new.organization_id;
  exception
    when undefined_column then
      org_id := null;
  end;

  insert into public.campaign_end_notifications (
    source_type,
    source_campaign_id,
    organization_id,
    title,
    store,
    origin,
    campaign_year,
    items,
    total_items,
    end_date,
    status,
    attempt_count,
    last_attempt_at,
    notified_at,
    last_error
  )
  values (
    source_kind,
    new.id::text,
    org_id,
    campaign_title,
    campaign_store,
    row_origin,
    campaign_year,
    campaign_items,
    campaign_total,
    calculated_end,
    'pending',
    0,
    null,
    null,
    ''
  )
  on conflict (source_type, source_campaign_id)
  do update set
    organization_id = excluded.organization_id,
    title = excluded.title,
    store = excluded.store,
    origin = excluded.origin,
    campaign_year = excluded.campaign_year,
    items = excluded.items,
    total_items = excluded.total_items,
    end_date = excluded.end_date,
    status = case
      when public.campaign_end_notifications.end_date is distinct from excluded.end_date
        then 'pending'
      when public.campaign_end_notifications.notified_at is null
        then 'pending'
      else public.campaign_end_notifications.status
    end,
    attempt_count = case
      when public.campaign_end_notifications.end_date is distinct from excluded.end_date
        then 0
      else public.campaign_end_notifications.attempt_count
    end,
    last_attempt_at = case
      when public.campaign_end_notifications.end_date is distinct from excluded.end_date
        then null
      else public.campaign_end_notifications.last_attempt_at
    end,
    notified_at = case
      when public.campaign_end_notifications.end_date is distinct from excluded.end_date
        then null
      else public.campaign_end_notifications.notified_at
    end,
    last_error = case
      when public.campaign_end_notifications.end_date is distinct from excluded.end_date
        then ''
      else public.campaign_end_notifications.last_error
    end;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.campaigns') is not null then
    drop trigger if exists capture_manual_campaign_end_notification on public.campaigns;
    create trigger capture_manual_campaign_end_notification
    after insert or update of dados, ano_validade, titulo, store, total_artigos
    on public.campaigns
    for each row
    execute function public.capture_campaign_end_notification('manual');
  end if;

  if to_regclass('public.automatic_campaigns') is not null then
    drop trigger if exists capture_automatic_campaign_end_notification on public.automatic_campaigns;
    create trigger capture_automatic_campaign_end_notification
    after insert or update of dados, ano_validade, titulo, store, total_artigos
    on public.automatic_campaigns
    for each row
    execute function public.capture_campaign_end_notification('automatic');
  end if;
end
$$;

-- Backfill any Praia campaigns that still exist today.
insert into public.campaign_end_notifications (
  source_type,
  source_campaign_id,
  organization_id,
  title,
  store,
  origin,
  campaign_year,
  items,
  total_items,
  end_date
)
select
  'manual',
  c.id::text,
  c.organization_id,
  coalesce(nullif(trim(c.titulo), ''), 'PROMOÇÃO'),
  c.store,
  c.origem,
  c.ano_validade,
  coalesce(c.dados, '[]'::jsonb),
  greatest(coalesce(c.total_artigos, 0), jsonb_array_length(coalesce(c.dados, '[]'::jsonb))),
  public.campaign_end_date_from_items(c.dados, c.ano_validade)
from public.campaigns c
where lower(coalesce(c.store, '')) like '%praia%'
  and public.campaign_end_date_from_items(c.dados, c.ano_validade) is not null
on conflict (source_type, source_campaign_id) do nothing;

insert into public.campaign_end_notifications (
  source_type,
  source_campaign_id,
  organization_id,
  title,
  store,
  origin,
  campaign_year,
  items,
  total_items,
  end_date
)
select
  'automatic',
  c.id::text,
  c.organization_id,
  coalesce(nullif(trim(c.titulo), ''), 'PROMOÇÃO'),
  c.store,
  c.origem,
  c.ano_validade,
  coalesce(c.dados, '[]'::jsonb),
  greatest(coalesce(c.total_artigos, 0), jsonb_array_length(coalesce(c.dados, '[]'::jsonb))),
  public.campaign_end_date_from_items(c.dados, c.ano_validade)
from public.automatic_campaigns c
where lower(coalesce(c.store, '')) like '%praia%'
  and public.campaign_end_date_from_items(c.dados, c.ano_validade) is not null
on conflict (source_type, source_campaign_id) do nothing;

-- Atomic worker claim. Prevents duplicate emails when two jobs overlap.
create or replace function public.claim_campaign_end_notifications(p_limit integer default 20)
returns setof public.campaign_end_notifications
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select n.id
    from public.campaign_end_notifications n
    where n.notified_at is null
      and n.end_date < (now() at time zone 'Atlantic/Azores')::date
      and n.attempt_count < 5
      and (
        n.status in ('pending', 'failed')
        or (
          n.status = 'processing'
          and n.last_attempt_at < now() - interval '30 minutes'
        )
      )
    order by n.end_date asc, n.created_at asc
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    for update skip locked
  )
  update public.campaign_end_notifications n
  set
    status = 'processing',
    attempt_count = n.attempt_count + 1,
    last_attempt_at = now(),
    last_error = ''
  from candidates c
  where n.id = c.id
  returning n.*;
end;
$$;

revoke all on function public.claim_campaign_end_notifications(integer) from public;
grant execute on function public.claim_campaign_end_notifications(integer) to service_role;

-- Frontend: store-scoped, read-only access to the durable campaign snapshot.
alter table public.campaign_end_notifications enable row level security;
revoke all on public.campaign_end_notifications from anon;
revoke insert, update, delete on public.campaign_end_notifications from authenticated;
grant select on public.campaign_end_notifications to authenticated;

drop policy if exists campaign_end_notifications_store_read
  on public.campaign_end_notifications;
create policy campaign_end_notifications_store_read
  on public.campaign_end_notifications
  for select
  to authenticated
  using (public.can_access_store(store));

alter table public.campaign_end_notification_deliveries enable row level security;
revoke all on public.campaign_end_notification_deliveries from anon, authenticated;
