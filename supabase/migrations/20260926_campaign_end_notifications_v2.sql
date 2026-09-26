-- PromoPilot · Campaign lifecycle notifications V2
-- IMPORTANT: campaign end is derived from dados[*].dataFim, NOT from expires_at.
-- expires_at is only history retention and may be 2/5 days after creation.

create table if not exists public.campaign_end_notifications (
  id text primary key,
  source_table text not null check (source_table in ('campaigns', 'automatic_campaigns')),
  campaign_id text not null,
  organization_id uuid null references public.organizations(id) on delete set null,
  titulo text not null default 'PROMO',
  dados jsonb not null default '[]'::jsonb,
  ano_validade integer,
  formato_etiqueta text not null default 'a6',
  origem text not null default 'manual',
  created_by text not null default 'Utilizador',
  created_by_email text not null default '',
  campaign_created_at timestamptz not null default now(),
  store text not null default '',
  total_artigos integer not null default 0,
  ends_at timestamptz not null,
  status text not null default 'pending',
  claimed_at timestamptz,
  notification_attempts integer not null default 0,
  notification_sent_at timestamptz,
  recipient_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_table, campaign_id)
);

-- Makes this migration safe if an earlier incomplete version created the table.
-- Columns are added without new NOT NULL requirements so a partially-created old table can be repaired.
alter table public.campaign_end_notifications add column if not exists source_table text;
alter table public.campaign_end_notifications add column if not exists campaign_id text;
alter table public.campaign_end_notifications add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.campaign_end_notifications add column if not exists titulo text default 'PROMO';
alter table public.campaign_end_notifications add column if not exists dados jsonb default '[]'::jsonb;
alter table public.campaign_end_notifications add column if not exists ano_validade integer;
alter table public.campaign_end_notifications add column if not exists formato_etiqueta text default 'a6';
alter table public.campaign_end_notifications add column if not exists origem text default 'manual';
alter table public.campaign_end_notifications add column if not exists created_by text default 'Utilizador';
alter table public.campaign_end_notifications add column if not exists created_by_email text default '';
alter table public.campaign_end_notifications add column if not exists campaign_created_at timestamptz default now();
alter table public.campaign_end_notifications add column if not exists store text default '';
alter table public.campaign_end_notifications add column if not exists total_artigos integer default 0;
alter table public.campaign_end_notifications add column if not exists status text default 'pending';
alter table public.campaign_end_notifications add column if not exists created_at timestamptz default now();
alter table public.campaign_end_notifications add column if not exists ends_at timestamptz;
alter table public.campaign_end_notifications add column if not exists claimed_at timestamptz;
alter table public.campaign_end_notifications add column if not exists notification_attempts integer not null default 0;
alter table public.campaign_end_notifications add column if not exists notification_sent_at timestamptz;
alter table public.campaign_end_notifications add column if not exists recipient_count integer not null default 0;
alter table public.campaign_end_notifications add column if not exists last_error text;
alter table public.campaign_end_notifications add column if not exists updated_at timestamptz not null default now();

create index if not exists campaign_end_notifications_due_idx
  on public.campaign_end_notifications (store, ends_at)
  where notification_sent_at is null;

create index if not exists campaign_end_notifications_campaign_idx
  on public.campaign_end_notifications (source_table, campaign_id);

create table if not exists public.campaign_end_notification_deliveries (
  notification_id text not null references public.campaign_end_notifications(id) on delete cascade,
  user_id uuid not null,
  email text not null,
  first_name text not null default '',
  status text not null default 'pending',
  attempt_count integer not null default 0,
  resend_id text,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists campaign_end_notification_deliveries_status_idx
  on public.campaign_end_notification_deliveries (notification_id, status);

alter table public.campaign_end_notifications enable row level security;
alter table public.campaign_end_notification_deliveries enable row level security;

-- Convert campaign item date strings to the real end-of-day instant in the Azores.
-- Supported examples: 30/09, 30/09/2026, 30-09-2026, 30/set, 30/set/2026.
create or replace function public.promopilot_campaign_ends_at(
  p_dados jsonb,
  p_ano_validade integer,
  p_created_at timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_item jsonb;
  v_raw text;
  v_match text[];
  v_day integer;
  v_month integer;
  v_year integer;
  v_month_text text;
  v_candidate timestamptz;
  v_latest timestamptz := null;
  v_has_explicit_year boolean;
begin
  if jsonb_typeof(coalesce(p_dados, '[]'::jsonb)) <> 'array' then
    return null;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_dados, '[]'::jsonb))
  loop
    v_raw := lower(trim(coalesce(v_item ->> 'dataFim', '')));
    v_raw := replace(v_raw, '.', '');
    v_raw := replace(v_raw, ' ', '');

    if v_raw = '' or v_raw = '-' then
      continue;
    end if;

    v_day := null;
    v_month := null;
    v_year := null;
    v_has_explicit_year := false;

    -- Numeric month, first with explicit year and then without year.
    v_match := regexp_match(v_raw, '^([0-9]{1,2})[/-]([0-9]{1,2})[/-]([0-9]{2,4})$');

    if v_match is not null then
      v_day := v_match[1]::integer;
      v_month := v_match[2]::integer;
      v_year := v_match[3]::integer;
      v_has_explicit_year := true;
    else
      v_match := regexp_match(v_raw, '^([0-9]{1,2})[/-]([0-9]{1,2})$');
      if v_match is not null then
        v_day := v_match[1]::integer;
        v_month := v_match[2]::integer;
      else
        -- Portuguese abbreviated month, with or without explicit year.
        v_match := regexp_match(v_raw, '^([0-9]{1,2})[/-]([a-z]{3})[/-]([0-9]{2,4})$');
        if v_match is not null then
          v_day := v_match[1]::integer;
          v_month_text := v_match[2];
          v_year := v_match[3]::integer;
          v_has_explicit_year := true;
        else
          v_match := regexp_match(v_raw, '^([0-9]{1,2})[/-]([a-z]{3})$');
          if v_match is null then
            continue;
          end if;
          v_day := v_match[1]::integer;
          v_month_text := v_match[2];
        end if;

        v_month := case v_month_text
          when 'jan' then 1
          when 'fev' then 2
          when 'mar' then 3
          when 'abr' then 4
          when 'mai' then 5
          when 'jun' then 6
          when 'jul' then 7
          when 'ago' then 8
          when 'set' then 9
          when 'out' then 10
          when 'nov' then 11
          when 'dez' then 12
          else null
        end;

        if v_month is null then
          continue;
        end if;
      end if;
    end if;

    if v_year is null then
      v_year := coalesce(
        p_ano_validade,
        extract(year from (coalesce(p_created_at, now()) at time zone 'Atlantic/Azores'))::integer
      );
    elsif v_year < 100 then
      v_year := 2000 + v_year;
    end if;

    begin
      v_candidate := make_timestamptz(v_year, v_month, v_day, 23, 59, 59, 'Atlantic/Azores');
    exception when others then
      continue;
    end;

    -- Handles Dec -> Jan campaigns when item dates do not include an explicit year.
    if not v_has_explicit_year
       and p_created_at is not null
       and v_candidate < p_created_at - interval '180 days' then
      begin
        v_candidate := make_timestamptz(v_year + 1, v_month, v_day, 23, 59, 59, 'Atlantic/Azores');
      exception when others then
        continue;
      end;
    end if;

    if v_latest is null or v_candidate > v_latest then
      v_latest := v_candidate;
    end if;
  end loop;

  return v_latest;
end;
$$;

create or replace function public.promopilot_sync_campaign_end_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ends_at timestamptz;
  v_source_table text;
  v_notification_id text;
begin
  v_ends_at := public.promopilot_campaign_ends_at(NEW.dados, NEW.ano_validade, NEW.created_at);

  -- A campaign without a concrete end date cannot safely generate an end notification.
  if v_ends_at is null then
    return NEW;
  end if;

  v_source_table := TG_TABLE_NAME;
  v_notification_id := v_source_table || ':' || NEW.id;

  insert into public.campaign_end_notifications (
    id,
    source_table,
    campaign_id,
    organization_id,
    titulo,
    dados,
    ano_validade,
    formato_etiqueta,
    origem,
    created_by,
    created_by_email,
    campaign_created_at,
    store,
    total_artigos,
    ends_at,
    status,
    updated_at
  ) values (
    v_notification_id,
    v_source_table,
    NEW.id,
    NEW.organization_id,
    coalesce(nullif(NEW.titulo, ''), 'PROMO'),
    coalesce(NEW.dados, '[]'::jsonb),
    NEW.ano_validade,
    coalesce(nullif(NEW.formato_etiqueta, ''), 'a6'),
    coalesce(nullif(NEW.origem, ''), case when v_source_table = 'automatic_campaigns' then 'automatico-email' else 'manual' end),
    coalesce(nullif(NEW.created_by, ''), 'Utilizador'),
    coalesce(NEW.created_by_email, ''),
    coalesce(NEW.created_at, now()),
    coalesce(NEW.store, ''),
    coalesce(NEW.total_artigos, jsonb_array_length(coalesce(NEW.dados, '[]'::jsonb))),
    v_ends_at,
    'pending',
    now()
  )
  on conflict (id) do update set
    organization_id = excluded.organization_id,
    titulo = excluded.titulo,
    dados = excluded.dados,
    ano_validade = excluded.ano_validade,
    formato_etiqueta = excluded.formato_etiqueta,
    origem = excluded.origem,
    created_by = excluded.created_by,
    created_by_email = excluded.created_by_email,
    campaign_created_at = excluded.campaign_created_at,
    store = excluded.store,
    total_artigos = excluded.total_artigos,
    ends_at = excluded.ends_at,
    updated_at = now();

  return NEW;
end;
$$;

drop trigger if exists campaigns_capture_end_notification on public.campaigns;
create trigger campaigns_capture_end_notification
after insert or update of dados, ano_validade, titulo, formato_etiqueta, origem, store, total_artigos
on public.campaigns
for each row execute function public.promopilot_sync_campaign_end_notification();

drop trigger if exists automatic_campaigns_capture_end_notification on public.automatic_campaigns;
create trigger automatic_campaigns_capture_end_notification
after insert or update of dados, ano_validade, titulo, formato_etiqueta, origem, store, total_artigos
on public.automatic_campaigns
for each row execute function public.promopilot_sync_campaign_end_notification();

-- Backfill every campaign still present in history. Future source cleanup does not remove these snapshots.
insert into public.campaign_end_notifications (
  id, source_table, campaign_id, organization_id, titulo, dados, ano_validade,
  formato_etiqueta, origem, created_by, created_by_email, campaign_created_at,
  store, total_artigos, ends_at, status, updated_at
)
select
  'campaigns:' || c.id,
  'campaigns',
  c.id,
  c.organization_id,
  coalesce(nullif(c.titulo, ''), 'PROMO'),
  coalesce(c.dados, '[]'::jsonb),
  c.ano_validade,
  coalesce(nullif(c.formato_etiqueta, ''), 'a6'),
  coalesce(nullif(c.origem, ''), 'manual'),
  coalesce(nullif(c.created_by, ''), 'Utilizador'),
  coalesce(c.created_by_email, ''),
  coalesce(c.created_at, now()),
  coalesce(c.store, ''),
  coalesce(c.total_artigos, jsonb_array_length(coalesce(c.dados, '[]'::jsonb))),
  e.ends_at,
  'pending',
  now()
from public.campaigns c
cross join lateral (
  select public.promopilot_campaign_ends_at(c.dados, c.ano_validade, c.created_at) as ends_at
) e
where e.ends_at is not null
on conflict (id) do update set
  dados = excluded.dados,
  ends_at = excluded.ends_at,
  total_artigos = excluded.total_artigos,
  store = excluded.store,
  updated_at = now();

insert into public.campaign_end_notifications (
  id, source_table, campaign_id, organization_id, titulo, dados, ano_validade,
  formato_etiqueta, origem, created_by, created_by_email, campaign_created_at,
  store, total_artigos, ends_at, status, updated_at
)
select
  'automatic_campaigns:' || c.id,
  'automatic_campaigns',
  c.id,
  c.organization_id,
  coalesce(nullif(c.titulo, ''), 'Campanha automática'),
  coalesce(c.dados, '[]'::jsonb),
  c.ano_validade,
  coalesce(nullif(c.formato_etiqueta, ''), 'automatico'),
  coalesce(nullif(c.origem, ''), 'automatico-email'),
  coalesce(nullif(c.created_by, ''), 'Sistema automático'),
  coalesce(c.created_by_email, ''),
  coalesce(c.created_at, now()),
  coalesce(c.store, ''),
  coalesce(c.total_artigos, jsonb_array_length(coalesce(c.dados, '[]'::jsonb))),
  e.ends_at,
  'pending',
  now()
from public.automatic_campaigns c
cross join lateral (
  select public.promopilot_campaign_ends_at(c.dados, c.ano_validade, c.created_at) as ends_at
) e
where e.ends_at is not null
on conflict (id) do update set
  dados = excluded.dados,
  ends_at = excluded.ends_at,
  total_artigos = excluded.total_artigos,
  store = excluded.store,
  updated_at = now();

-- Atomic claim: safe even if more than one Render instance is running.
create or replace function public.claim_campaign_end_notifications(
  p_store text default 'Loja da Praia',
  p_limit integer default 20
)
returns setof public.campaign_end_notifications
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select n.id
    from public.campaign_end_notifications n
    where n.store = p_store
      and n.notification_sent_at is null
      and n.ends_at <= now()
      and (
        n.status in ('pending', 'failed', 'waiting_recipients')
        or (n.status = 'processing' and coalesce(n.claimed_at, n.updated_at) < now() - interval '30 minutes')
      )
    order by n.ends_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.campaign_end_notifications n
  set
    status = 'processing',
    claimed_at = now(),
    notification_attempts = n.notification_attempts + 1,
    last_error = null,
    updated_at = now()
  from picked
  where n.id = picked.id
  returning n.*;
end;
$$;

revoke all on function public.claim_campaign_end_notifications(text, integer) from public, anon, authenticated;
grant execute on function public.claim_campaign_end_notifications(text, integer) to service_role;
