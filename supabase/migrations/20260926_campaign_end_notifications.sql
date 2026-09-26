-- PromoPilot — notificações de fim de campanha (Praia)
-- V2 reparada: id é UUID gerado pelo PostgreSQL; a chave textual de origem fica em source_key.

create extension if not exists pgcrypto;

create table if not exists public.campaign_end_notifications (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('campaigns', 'automatic_campaigns')),
  source_campaign_id text not null,
  source_key text not null unique,
  organization_id uuid,
  store text not null default '',
  title text not null default 'Campanha',
  items jsonb not null default '[]'::jsonb,
  total_items integer not null default 0,
  campaign_end_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  locked_at timestamptz,
  sent_at timestamptz,
  recipient_emails text[] not null default '{}'::text[],
  provider_message_ids text[] not null default '{}'::text[],
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Compatibilidade com uma execução parcial da V1: se a tabela já tiver sido
-- criada antes do erro de backfill, completamos o schema sem apagar dados.
alter table public.campaign_end_notifications
  add column if not exists source_type text,
  add column if not exists source_campaign_id text,
  add column if not exists source_key text,
  add column if not exists organization_id uuid,
  add column if not exists store text default '',
  add column if not exists title text default 'Campanha',
  add column if not exists items jsonb default '[]'::jsonb,
  add column if not exists total_items integer default 0,
  add column if not exists campaign_end_at timestamptz,
  add column if not exists status text default 'pending',
  add column if not exists attempts integer default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists recipient_emails text[] default '{}'::text[],
  add column if not exists provider_message_ids text[] default '{}'::text[],
  add column if not exists last_error text default '',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.campaign_end_notifications
  alter column id set default gen_random_uuid();

-- Se uma versão anterior já tinha linhas válidas, cria a chave textual no
-- local certo. O UUID de `id` nunca é usado como chave de origem.
update public.campaign_end_notifications
set source_key = source_type || ':' || source_campaign_id
where (source_key is null or btrim(source_key) = '')
  and source_type is not null
  and source_campaign_id is not null;

create unique index if not exists campaign_end_notifications_source_key_uidx
  on public.campaign_end_notifications (source_key);

create index if not exists campaign_end_notifications_due_idx
  on public.campaign_end_notifications (status, campaign_end_at, next_attempt_at);

create index if not exists campaign_end_notifications_store_idx
  on public.campaign_end_notifications (store, campaign_end_at desc);

alter table public.campaign_end_notifications enable row level security;
revoke all on public.campaign_end_notifications from anon;
revoke all on public.campaign_end_notifications from authenticated;
grant select, insert, update, delete on public.campaign_end_notifications to service_role;

-- Apenas o backend com service_role gere esta tabela.

create or replace function public.campaign_end_notification_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_campaign_end_notifications_updated_at on public.campaign_end_notifications;
create trigger trg_campaign_end_notifications_updated_at
before update on public.campaign_end_notifications
for each row execute function public.campaign_end_notification_set_updated_at();

create or replace function public.campaign_item_end_at(
  p_item jsonb,
  p_year integer default extract(year from now())::integer
)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_raw text;
  v_day integer;
  v_month integer;
  v_year integer;
begin
  v_raw := btrim(coalesce(
    p_item ->> 'dataFim',
    p_item ->> 'data_fim',
    p_item ->> 'fim',
    p_item ->> 'endDate',
    ''
  ));

  if v_raw = '' or v_raw = '-' then
    return null;
  end if;

  -- YYYY-MM-DD
  if v_raw ~ '^\d{4}-\d{2}-\d{2}$' then
    v_year := substring(v_raw from 1 for 4)::integer;
    v_month := substring(v_raw from 6 for 2)::integer;
    v_day := substring(v_raw from 9 for 2)::integer;
    return make_timestamptz(v_year, v_month, v_day, 23, 59, 59, 'Atlantic/Azores');
  end if;

  -- DD/MM[/YYYY] ou DD-MM[-YYYY]
  if v_raw ~ '^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$' then
    v_day := split_part(replace(v_raw, '-', '/'), '/', 1)::integer;
    v_month := split_part(replace(v_raw, '-', '/'), '/', 2)::integer;
    v_year := nullif(split_part(replace(v_raw, '-', '/'), '/', 3), '')::integer;

    if v_year is null then
      v_year := coalesce(p_year, extract(year from now())::integer);
    elsif v_year < 100 then
      v_year := 2000 + v_year;
    end if;

    return make_timestamptz(v_year, v_month, v_day, 23, 59, 59, 'Atlantic/Azores');
  end if;

  return null;
exception
  when others then
    return null;
end;
$$;

create or replace function public.campaign_end_at_from_items(
  p_items jsonb,
  p_year integer default extract(year from now())::integer
)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_item jsonb;
  v_end timestamptz;
  v_max timestamptz := null;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return null;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_end := public.campaign_item_end_at(v_item, p_year);
    if v_end is not null and (v_max is null or v_end > v_max) then
      v_max := v_end;
    end if;
  end loop;

  return v_max;
end;
$$;

create or replace function public.sync_campaign_end_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_type text := tg_table_name;
  v_source_id text;
  v_source_key text;
  v_end_at timestamptz;
  v_store text;
  v_title text;
  v_items jsonb;
  v_year integer;
  v_org uuid;
begin
  v_source_id := new.id::text;
  v_source_key := v_source_type || ':' || v_source_id;
  v_store := coalesce(new.store, '');

  -- Só a Loja da Praia gera este tipo de notificação.
  if lower(btrim(v_store)) not in ('loja da praia', 'praia') then
    delete from public.campaign_end_notifications
      where source_key = v_source_key and status in ('pending', 'processing');
    return new;
  end if;

  v_title := coalesce(new.titulo, 'Campanha');
  v_items := coalesce(new.dados, '[]'::jsonb);
  v_year := coalesce(new.ano_validade, extract(year from now())::integer);
  v_end_at := public.campaign_end_at_from_items(v_items, v_year);

  v_org := nullif(to_jsonb(new) ->> 'organization_id', '')::uuid;

  if v_end_at is null then
    delete from public.campaign_end_notifications
      where source_key = v_source_key and status in ('pending', 'processing');
    return new;
  end if;

  insert into public.campaign_end_notifications (
    source_type,
    source_campaign_id,
    source_key,
    organization_id,
    store,
    title,
    items,
    total_items,
    campaign_end_at,
    status,
    next_attempt_at
  )
  values (
    v_source_type,
    v_source_id,
    v_source_key,
    v_org,
    v_store,
    v_title,
    v_items,
    case when jsonb_typeof(v_items) = 'array' then jsonb_array_length(v_items) else 0 end,
    v_end_at,
    'pending',
    v_end_at
  )
  on conflict (source_key) do update set
    organization_id = excluded.organization_id,
    store = excluded.store,
    title = excluded.title,
    items = excluded.items,
    total_items = excluded.total_items,
    campaign_end_at = excluded.campaign_end_at,
    next_attempt_at = case
      when public.campaign_end_notifications.status = 'sent'
        then public.campaign_end_notifications.next_attempt_at
      else excluded.campaign_end_at
    end,
    status = case
      when public.campaign_end_notifications.status = 'sent'
        then public.campaign_end_notifications.status
      else 'pending'
    end,
    last_error = case
      when public.campaign_end_notifications.status = 'sent'
        then public.campaign_end_notifications.last_error
      else ''
    end,
    locked_at = null;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.campaigns') is not null then
    drop trigger if exists trg_campaigns_campaign_end_notification on public.campaigns;
    create trigger trg_campaigns_campaign_end_notification
    after insert or update of titulo, dados, ano_validade, store
    on public.campaigns
    for each row execute function public.sync_campaign_end_notification();
  end if;

  if to_regclass('public.automatic_campaigns') is not null then
    drop trigger if exists trg_automatic_campaigns_campaign_end_notification on public.automatic_campaigns;
    create trigger trg_automatic_campaigns_campaign_end_notification
    after insert or update of titulo, dados, ano_validade, store
    on public.automatic_campaigns
    for each row execute function public.sync_campaign_end_notification();
  end if;
end;
$$;

-- Claim atómico: evita emails duplicados quando existem dois workers em simultâneo.
create or replace function public.claim_due_campaign_end_notifications(p_limit integer default 25)
returns setof public.campaign_end_notifications
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select n.id
    from public.campaign_end_notifications n
    where n.campaign_end_at <= now()
      and coalesce(n.next_attempt_at, n.campaign_end_at) <= now()
      and (
        n.status = 'pending'
        or (n.status = 'processing' and n.locked_at < now() - interval '20 minutes')
      )
    order by n.campaign_end_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update public.campaign_end_notifications n
  set status = 'processing',
      attempts = n.attempts + 1,
      locked_at = now(),
      updated_at = now()
  from due
  where n.id = due.id
  returning n.*;
end;
$$;

revoke all on function public.claim_due_campaign_end_notifications(integer) from public;
grant execute on function public.claim_due_campaign_end_notifications(integer) to service_role;

-- Backfill seguro. NOTA: id NÃO recebe strings; source_key guarda a chave textual.
do $$
begin
  if to_regclass('public.campaigns') is not null then
    insert into public.campaign_end_notifications (
      source_type, source_campaign_id, source_key, organization_id,
      store, title, items, total_items, campaign_end_at, next_attempt_at
    )
    select
      'campaigns',
      c.id::text,
      'campaigns:' || c.id::text,
      nullif(to_jsonb(c) ->> 'organization_id', '')::uuid,
      c.store,
      coalesce(c.titulo, 'Campanha'),
      coalesce(c.dados, '[]'::jsonb),
      coalesce(c.total_artigos, case when jsonb_typeof(c.dados) = 'array' then jsonb_array_length(c.dados) else 0 end),
      public.campaign_end_at_from_items(coalesce(c.dados, '[]'::jsonb), c.ano_validade),
      public.campaign_end_at_from_items(coalesce(c.dados, '[]'::jsonb), c.ano_validade)
    from public.campaigns c
    where lower(btrim(c.store)) in ('loja da praia', 'praia')
      and public.campaign_end_at_from_items(coalesce(c.dados, '[]'::jsonb), c.ano_validade) is not null
      and public.campaign_end_at_from_items(coalesce(c.dados, '[]'::jsonb), c.ano_validade) >= now()
    on conflict (source_key) do nothing;
  end if;

  if to_regclass('public.automatic_campaigns') is not null then
    insert into public.campaign_end_notifications (
      source_type, source_campaign_id, source_key, organization_id,
      store, title, items, total_items, campaign_end_at, next_attempt_at
    )
    select
      'automatic_campaigns',
      c.id::text,
      'automatic_campaigns:' || c.id::text,
      nullif(to_jsonb(c) ->> 'organization_id', '')::uuid,
      c.store,
      coalesce(c.titulo, c.email_subject, 'Campanha automática'),
      coalesce(c.dados, '[]'::jsonb),
      coalesce(c.total_artigos, case when jsonb_typeof(c.dados) = 'array' then jsonb_array_length(c.dados) else 0 end),
      public.campaign_end_at_from_items(coalesce(c.dados, '[]'::jsonb), c.ano_validade),
      public.campaign_end_at_from_items(coalesce(c.dados, '[]'::jsonb), c.ano_validade)
    from public.automatic_campaigns c
    where lower(btrim(c.store)) in ('loja da praia', 'praia')
      and public.campaign_end_at_from_items(coalesce(c.dados, '[]'::jsonb), c.ano_validade) is not null
      and public.campaign_end_at_from_items(coalesce(c.dados, '[]'::jsonb), c.ano_validade) >= now()
    on conflict (source_key) do nothing;
  end if;
end;
$$;
