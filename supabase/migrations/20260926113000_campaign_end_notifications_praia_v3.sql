-- PromoPilot · Campaign End Notifications · V3
-- Definitive, isolated implementation for Loja da Praia.
-- Uses its own archive table to avoid coupling to legacy campaign-end experiments.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Date parser used by both manual/Excel and automatic campaigns.
-- ---------------------------------------------------------------------------
create or replace function public.promopilot_v3_parse_campaign_date(
  p_value text,
  p_year_hint integer
)
returns date
language plpgsql
immutable
as $$
declare
  v text := lower(trim(coalesce(p_value, '')));
  parts text[];
  d integer;
  m integer;
  y integer;
  mon text;
begin
  if v = '' or v = '-' then return null; end if;
  v := replace(v, '.', '');

  if v ~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$' then
    parts := string_to_array(v, '-');
    return make_date(parts[1]::integer, parts[2]::integer, parts[3]::integer);
  end if;

  if v ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' then
    parts := string_to_array(v, '/');
    return make_date(parts[3]::integer, parts[2]::integer, parts[1]::integer);
  end if;

  if v ~ '^[0-9]{1,2}/[0-9]{1,2}$' then
    parts := string_to_array(v, '/');
    y := coalesce(nullif(p_year_hint, 0), extract(year from current_date)::integer);
    return make_date(y, parts[2]::integer, parts[1]::integer);
  end if;

  if v ~ '^[0-9]{1,2}/[[:alpha:]]{3}(/[0-9]{4})?$' then
    parts := string_to_array(v, '/');
    d := parts[1]::integer;
    mon := parts[2];
    m := case mon
      when 'jan' then 1 when 'fev' then 2 when 'feb' then 2
      when 'mar' then 3 when 'abr' then 4 when 'apr' then 4
      when 'mai' then 5 when 'may' then 5 when 'jun' then 6
      when 'jul' then 7 when 'ago' then 8 when 'aug' then 8
      when 'set' then 9 when 'sep' then 9 when 'out' then 10
      when 'oct' then 10 when 'nov' then 11 when 'dez' then 12
      when 'dec' then 12 else null
    end;
    if m is null then return null; end if;
    y := case
      when array_length(parts, 1) >= 3 then parts[3]::integer
      else coalesce(nullif(p_year_hint, 0), extract(year from current_date)::integer)
    end;
    return make_date(y, m, d);
  end if;

  return null;
exception when others then
  return null;
end;
$$;

create or replace function public.promopilot_v3_campaign_end_date(
  p_dados jsonb,
  p_year_hint integer,
  p_title text
)
returns date
language plpgsql
immutable
as $$
declare
  item jsonb;
  parsed date;
  last_day date := null;
  normalized_title text;
begin
  normalized_title := upper(
    translate(
      trim(coalesce(p_title, '')),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC'
    )
  );

  -- Não é uma campanha promocional com lifecycle.
  if normalized_title = 'ARTIGO C/DEFEITO' then
    return null;
  end if;

  if jsonb_typeof(coalesce(p_dados, '[]'::jsonb)) = 'array' then
    for item in select value from jsonb_array_elements(coalesce(p_dados, '[]'::jsonb))
    loop
      parsed := public.promopilot_v3_parse_campaign_date(
        coalesce(
          item->>'dataFim',
          item->>'data_fim',
          item->>'DATA FIM',
          item->>'DATA_FIM',
          ''
        ),
        p_year_hint
      );

      if parsed is not null and (last_day is null or parsed > last_day) then
        last_day := parsed;
      end if;
    end loop;
  end if;

  return last_day;
end;
$$;

create or replace function public.promopilot_v3_is_praia_store(p_store text)
returns boolean
language sql
immutable
as $$
  select position(
    'praia' in lower(
      translate(
        trim(coalesce(p_store, '')),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
        'AAAAAEEEEIIIIOOOOOUUUUC'
      )
    )
  ) > 0;
$$;

-- ---------------------------------------------------------------------------
-- Runtime state on campaign rows.
-- ---------------------------------------------------------------------------
alter table if exists public.campaigns
  add column if not exists campaign_end_date date,
  add column if not exists campaign_end_notification_status text not null default 'pending',
  add column if not exists campaign_end_notification_attempted_at timestamptz,
  add column if not exists campaign_end_notified_at timestamptz,
  add column if not exists campaign_end_notification_error text not null default '',
  add column if not exists campaign_end_notification_provider_id text not null default '';

alter table if exists public.automatic_campaigns
  add column if not exists campaign_end_date date,
  add column if not exists campaign_end_notification_status text not null default 'pending',
  add column if not exists campaign_end_notification_attempted_at timestamptz,
  add column if not exists campaign_end_notified_at timestamptz,
  add column if not exists campaign_end_notification_error text not null default '',
  add column if not exists campaign_end_notification_provider_id text not null default '';

create or replace function public.promopilot_v3_sync_campaign_lifecycle()
returns trigger
language plpgsql
as $$
declare
  old_end date;
  new_end date;
  keep_until timestamptz;
begin
  old_end := case when tg_op = 'UPDATE' then old.campaign_end_date else null end;
  new_end := public.promopilot_v3_campaign_end_date(new.dados, new.ano_validade, new.titulo);
  new.campaign_end_date := new_end;

  if new_end is not null then
    keep_until := ((new_end + 30)::timestamp at time zone 'Atlantic/Azores');
    if new.expires_at is null or new.expires_at < keep_until then
      new.expires_at := keep_until;
    end if;
  end if;

  if not public.promopilot_v3_is_praia_store(new.store) or new_end is null then
    new.campaign_end_notification_status := 'skipped';
    new.campaign_end_notification_error := case
      when new_end is null then 'Campanha sem DATA FIM válida.'
      else 'Loja fora do âmbito da notificação de fim de campanha.'
    end;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.campaign_end_notification_status := 'pending';
    new.campaign_end_notification_error := '';
    return new;
  end if;

  -- Se a campanha foi prolongada/alterada depois de um fecho anterior,
  -- cria um novo lifecycle para a nova data de fim.
  if new_end is distinct from old_end then
    new.campaign_end_notification_status := 'pending';
    new.campaign_end_notification_attempted_at := null;
    new.campaign_end_notified_at := null;
    new.campaign_end_notification_error := '';
    new.campaign_end_notification_provider_id := '';
  elsif new.campaign_end_notified_at is not null then
    new.campaign_end_notification_status := 'sent';
  elsif new.campaign_end_notification_status = 'skipped' then
    new.campaign_end_notification_status := 'pending';
    new.campaign_end_notification_error := '';
  end if;

  return new;
end;
$$;

drop trigger if exists promopilot_v3_sync_campaign_lifecycle on public.campaigns;
create trigger promopilot_v3_sync_campaign_lifecycle
before insert or update of dados, ano_validade, titulo, store, expires_at
on public.campaigns
for each row execute function public.promopilot_v3_sync_campaign_lifecycle();

drop trigger if exists promopilot_v3_sync_automatic_campaign_lifecycle on public.automatic_campaigns;
create trigger promopilot_v3_sync_automatic_campaign_lifecycle
before insert or update of dados, ano_validade, titulo, store, expires_at
on public.automatic_campaigns
for each row execute function public.promopilot_v3_sync_campaign_lifecycle();

-- Backfill atual, sem disparar emails para outras lojas.
update public.campaigns
set
  campaign_end_date = public.promopilot_v3_campaign_end_date(dados, ano_validade, titulo),
  campaign_end_notification_status = case
    when campaign_end_notified_at is not null then 'sent'
    when public.promopilot_v3_is_praia_store(store)
      and public.promopilot_v3_campaign_end_date(dados, ano_validade, titulo) is not null then 'pending'
    else 'skipped'
  end,
  campaign_end_notification_error = case
    when public.promopilot_v3_is_praia_store(store)
      and public.promopilot_v3_campaign_end_date(dados, ano_validade, titulo) is not null then ''
    else campaign_end_notification_error
  end;

update public.automatic_campaigns
set
  campaign_end_date = public.promopilot_v3_campaign_end_date(dados, ano_validade, titulo),
  campaign_end_notification_status = case
    when campaign_end_notified_at is not null then 'sent'
    when public.promopilot_v3_is_praia_store(store)
      and public.promopilot_v3_campaign_end_date(dados, ano_validade, titulo) is not null then 'pending'
    else 'skipped'
  end,
  campaign_end_notification_error = case
    when public.promopilot_v3_is_praia_store(store)
      and public.promopilot_v3_campaign_end_date(dados, ano_validade, titulo) is not null then ''
    else campaign_end_notification_error
  end;

update public.campaigns
set expires_at = greatest(
  expires_at,
  ((campaign_end_date + 30)::timestamp at time zone 'Atlantic/Azores')
)
where campaign_end_date is not null
  and public.promopilot_v3_is_praia_store(store);

update public.automatic_campaigns
set expires_at = greatest(
  expires_at,
  ((campaign_end_date + 30)::timestamp at time zone 'Atlantic/Azores')
)
where campaign_end_date is not null
  and public.promopilot_v3_is_praia_store(store);

create index if not exists campaigns_v3_end_notification_due_idx
  on public.campaigns (campaign_end_date, campaign_end_notification_status)
  where campaign_end_notified_at is null;

create index if not exists automatic_campaigns_v3_end_notification_due_idx
  on public.automatic_campaigns (campaign_end_date, campaign_end_notification_status)
  where campaign_end_notified_at is null;

-- ---------------------------------------------------------------------------
-- Durable snapshot used by the email link and delivery idempotency.
-- New table name deliberately isolates V3 from previous experiments.
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_end_notification_archive (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('manual', 'automatic')),
  campaign_id text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  store text not null,
  campaign_title text not null default 'Campanha',
  campaign_end_date date not null,
  campaign_snapshot jsonb not null default '{}'::jsonb,
  recipients jsonb not null default '[]'::jsonb,
  deliveries jsonb not null default '[]'::jsonb,
  status text not null default 'scheduled'
    check (status in ('scheduled','sending','sent','partial','failed','waiting_recipients')),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, campaign_id, campaign_end_date)
);

create index if not exists campaign_end_notification_archive_store_end_idx
  on public.campaign_end_notification_archive (store, campaign_end_date desc);

create index if not exists campaign_end_notification_archive_org_idx
  on public.campaign_end_notification_archive (organization_id)
  where organization_id is not null;

alter table public.campaign_end_notification_archive enable row level security;
revoke all on public.campaign_end_notification_archive from anon, authenticated;

comment on table public.campaign_end_notification_archive is
  'Server-owned durable snapshot and delivery ledger for Praia campaign-end notifications.';

commit;
