-- PromoPilot · Fim de campanha
-- Cria uma fila persistente para campanhas normais (inclui manual/Excel)
-- e campanhas automáticas. Apenas campanhas da Loja da Praia entram na fila.

create table if not exists public.campaign_end_notifications (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('manual', 'automatic')),
  campaign_id text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  store text not null,
  title text not null default 'Campanha',
  items jsonb not null default '[]'::jsonb,
  year_validity integer,
  article_count integer not null default 0,
  campaign_created_at timestamptz,
  campaign_end_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'error', 'skipped')),
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text not null default '',
  recipient_emails text[] not null default '{}'::text[],
  recipient_delivery jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, campaign_id, store)
);

-- Compatibilidade com tentativas/versões anteriores da funcionalidade.
alter table public.campaign_end_notifications
  add column if not exists source_type text,
  add column if not exists campaign_id text,
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists store text,
  add column if not exists title text not null default 'Campanha',
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists year_validity integer,
  add column if not exists article_count integer not null default 0,
  add column if not exists campaign_created_at timestamptz,
  add column if not exists campaign_end_at timestamptz,
  add column if not exists status text not null default 'pending',
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists last_error text not null default '',
  add column if not exists recipient_emails text[] not null default '{}'::text[],
  add column if not exists recipient_delivery jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists campaign_end_notifications_source_campaign_store_uidx
  on public.campaign_end_notifications (source_type, campaign_id, store);

create index if not exists campaign_end_notifications_due_idx
  on public.campaign_end_notifications (store, status, campaign_end_at)
  where campaign_end_at is not null;

create index if not exists campaign_end_notifications_campaign_idx
  on public.campaign_end_notifications (source_type, campaign_id);

alter table public.campaign_end_notifications enable row level security;
revoke all on public.campaign_end_notifications from anon, authenticated;

create or replace function public.set_campaign_end_notifications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_campaign_end_notifications_updated_at on public.campaign_end_notifications;
create trigger set_campaign_end_notifications_updated_at
before update on public.campaign_end_notifications
for each row execute function public.set_campaign_end_notifications_updated_at();

-- Converte as datas das etiquetas para date.
-- Suporta DD/MM, DD/MM/YYYY e YYYY-MM-DD.
create or replace function public.promopilot_parse_campaign_end_date(p_value text, p_year integer)
returns date
language plpgsql
immutable
as $$
declare
  v text := trim(coalesce(p_value, ''));
  parts text[];
  v_day integer;
  v_month integer;
  v_year integer;
begin
  if v = '' or v = '-' then
    return null;
  end if;

  begin
    if v ~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$' then
      return v::date;
    end if;

    if v ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' then
      parts := string_to_array(v, '/');
      v_day := parts[1]::integer;
      v_month := parts[2]::integer;
      v_year := parts[3]::integer;
      return make_date(v_year, v_month, v_day);
    end if;

    if v ~ '^[0-9]{1,2}/[0-9]{1,2}$' and p_year is not null then
      parts := string_to_array(v, '/');
      v_day := parts[1]::integer;
      v_month := parts[2]::integer;
      return make_date(p_year, v_month, v_day);
    end if;
  exception when others then
    return null;
  end;

  return null;
end;
$$;

create or replace function public.promopilot_campaign_end_at(
  p_items jsonb,
  p_year integer,
  p_created_at timestamptz,
  p_title text
)
returns timestamptz
language plpgsql
stable
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

  -- Este tipo de etiqueta é explicitamente "sem data definida" no PromoPilot.
  if normalized_title = 'ARTIGO C/DEFEITO' then
    return null;
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) = 'array' then
    for item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    loop
      parsed := public.promopilot_parse_campaign_end_date(
        coalesce(item->>'dataFim', item->>'data_fim', ''),
        p_year
      );

      if parsed is not null and (last_day is null or parsed > last_day) then
        last_day := parsed;
      end if;
    end loop;
  end if;

  if last_day is not null then
    -- Considera a campanha terminada no fim do dia nos Açores.
    return ((last_day::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'Atlantic/Azores');
  end if;

  -- A interface do PromoPilot assume 30 dias quando uma campanha normal
  -- não traz datas explícitas. Guardamos a mesma semântica na fila.
  return coalesce(p_created_at, now()) + interval '30 days';
end;
$$;

create or replace function public.promopilot_is_praia_store(p_store text)
returns boolean
language sql
immutable
as $$
  select regexp_replace(lower(trim(coalesce(p_store, ''))), '\s+', ' ', 'g') in ('loja da praia', 'praia');
$$;

create or replace function public.promopilot_queue_campaign_end_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_type text;
  v_end_at timestamptz;
  v_status text;
begin
  if not public.promopilot_is_praia_store(new.store) then
    return new;
  end if;

  v_source_type := case when tg_table_name = 'automatic_campaigns' then 'automatic' else 'manual' end;
  v_end_at := public.promopilot_campaign_end_at(new.dados, new.ano_validade, new.created_at, new.titulo);
  v_status := case when v_end_at is null then 'skipped' else 'pending' end;

  insert into public.campaign_end_notifications (
    source_type,
    campaign_id,
    organization_id,
    store,
    title,
    items,
    year_validity,
    article_count,
    campaign_created_at,
    campaign_end_at,
    status,
    last_error
  ) values (
    v_source_type,
    new.id,
    new.organization_id,
    new.store,
    coalesce(nullif(trim(new.titulo), ''), 'Campanha'),
    coalesce(new.dados, '[]'::jsonb),
    new.ano_validade,
    coalesce(new.total_artigos, jsonb_array_length(coalesce(new.dados, '[]'::jsonb))),
    new.created_at,
    v_end_at,
    v_status,
    case when v_end_at is null then 'Campanha sem data de fim definida.' else '' end
  )
  on conflict (source_type, campaign_id, store)
  do update set
    organization_id = excluded.organization_id,
    title = excluded.title,
    items = excluded.items,
    year_validity = excluded.year_validity,
    article_count = excluded.article_count,
    campaign_created_at = excluded.campaign_created_at,
    campaign_end_at = excluded.campaign_end_at,
    status = case
      when public.campaign_end_notifications.status = 'sent' then 'sent'
      else excluded.status
    end,
    last_error = case
      when public.campaign_end_notifications.status = 'sent' then public.campaign_end_notifications.last_error
      else excluded.last_error
    end;

  return new;
end;
$$;

-- Campanhas normais: manual + Excel usam a tabela campaigns.
drop trigger if exists queue_campaign_end_notification_manual on public.campaigns;
create trigger queue_campaign_end_notification_manual
after insert or update of titulo, dados, ano_validade, store, total_artigos, organization_id
on public.campaigns
for each row execute function public.promopilot_queue_campaign_end_notification();

-- Campanhas automáticas por email.
drop trigger if exists queue_campaign_end_notification_automatic on public.automatic_campaigns;
create trigger queue_campaign_end_notification_automatic
after insert or update of titulo, dados, ano_validade, store, total_artigos, organization_id
on public.automatic_campaigns
for each row execute function public.promopilot_queue_campaign_end_notification();

-- Backfill das campanhas ainda presentes no histórico no momento da migration.
insert into public.campaign_end_notifications (
  source_type, campaign_id, organization_id, store, title, items, year_validity,
  article_count, campaign_created_at, campaign_end_at, status, last_error
)
select
  'manual', c.id, c.organization_id, c.store, c.titulo, c.dados, c.ano_validade,
  c.total_artigos, c.created_at,
  public.promopilot_campaign_end_at(c.dados, c.ano_validade, c.created_at, c.titulo),
  case when public.promopilot_campaign_end_at(c.dados, c.ano_validade, c.created_at, c.titulo) is null then 'skipped' else 'pending' end,
  case when public.promopilot_campaign_end_at(c.dados, c.ano_validade, c.created_at, c.titulo) is null then 'Campanha sem data de fim definida.' else '' end
from public.campaigns c
where public.promopilot_is_praia_store(c.store)
on conflict (source_type, campaign_id, store) do nothing;

insert into public.campaign_end_notifications (
  source_type, campaign_id, organization_id, store, title, items, year_validity,
  article_count, campaign_created_at, campaign_end_at, status, last_error
)
select
  'automatic', c.id, c.organization_id, c.store, c.titulo, c.dados, c.ano_validade,
  c.total_artigos, c.created_at,
  public.promopilot_campaign_end_at(c.dados, c.ano_validade, c.created_at, c.titulo),
  case when public.promopilot_campaign_end_at(c.dados, c.ano_validade, c.created_at, c.titulo) is null then 'skipped' else 'pending' end,
  case when public.promopilot_campaign_end_at(c.dados, c.ano_validade, c.created_at, c.titulo) is null then 'Campanha sem data de fim definida.' else '' end
from public.automatic_campaigns c
where public.promopilot_is_praia_store(c.store)
on conflict (source_type, campaign_id, store) do nothing;

-- RPC segura usada pelo botão do email. Não expõe destinatários nem logs de envio.
create or replace function public.get_campaign_end_archive(p_id uuid)
returns table (
  id uuid,
  source_type text,
  campaign_id text,
  store text,
  title text,
  items jsonb,
  year_validity integer,
  article_count integer,
  campaign_created_at timestamptz,
  campaign_end_at timestamptz,
  sent_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id,
    n.source_type,
    n.campaign_id,
    n.store,
    n.title,
    n.items,
    n.year_validity,
    n.article_count,
    n.campaign_created_at,
    n.campaign_end_at,
    n.sent_at
  from public.campaign_end_notifications n
  where n.id = p_id
    and public.can_access_store(n.store)
  limit 1;
$$;

revoke all on function public.get_campaign_end_archive(uuid) from public, anon;
grant execute on function public.get_campaign_end_archive(uuid) to authenticated;
