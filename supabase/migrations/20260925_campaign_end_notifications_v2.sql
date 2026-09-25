-- PromoPilot
-- Campaign-end notifications (Praia) - V2
--
-- Fixes:
--   ERROR 42703: column "campaign_end_date" does not exist
--
-- The database derives campaign_end_date from dados[].dataFim so that
-- manual, Excel and automatic campaigns share the same lifecycle rule.

create or replace function public.promopilot_parse_campaign_date(
  p_value text,
  p_year_hint integer
)
returns date
language plpgsql
immutable
as $$
declare
  v text := lower(trim(coalesce(p_value, '')));
  v_parts text[];
  v_day integer;
  v_month integer;
  v_year integer;
  v_mon text;
begin
  if v = '' or v = '-' then
    return null;
  end if;

  v := replace(v, '.', '');

  if v ~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$' then
    v_parts := string_to_array(v, '-');
    return make_date(v_parts[1]::integer, v_parts[2]::integer, v_parts[3]::integer);
  end if;

  if v ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' then
    v_parts := string_to_array(v, '/');
    return make_date(v_parts[3]::integer, v_parts[2]::integer, v_parts[1]::integer);
  end if;

  if v ~ '^[0-9]{1,2}/[0-9]{1,2}$' then
    v_parts := string_to_array(v, '/');
    v_year := coalesce(nullif(p_year_hint, 0), extract(year from current_date)::integer);
    return make_date(v_year, v_parts[2]::integer, v_parts[1]::integer);
  end if;

  if v ~ '^[0-9]{1,2}/[[:alpha:]]{3}(/[0-9]{4})?$' then
    v_parts := string_to_array(v, '/');
    v_day := v_parts[1]::integer;
    v_mon := v_parts[2];

    v_month := case v_mon
      when 'jan' then 1 when 'fev' then 2 when 'feb' then 2
      when 'mar' then 3 when 'abr' then 4 when 'apr' then 4
      when 'mai' then 5 when 'may' then 5 when 'jun' then 6
      when 'jul' then 7 when 'ago' then 8 when 'aug' then 8
      when 'set' then 9 when 'sep' then 9 when 'out' then 10
      when 'oct' then 10 when 'nov' then 11 when 'dez' then 12
      when 'dec' then 12 else null
    end;

    if v_month is null then
      return null;
    end if;

    v_year := case
      when array_length(v_parts, 1) >= 3 then v_parts[3]::integer
      else coalesce(nullif(p_year_hint, 0), extract(year from current_date)::integer)
    end;

    return make_date(v_year, v_month, v_day);
  end if;

  return null;
exception
  when others then
    return null;
end;
$$;

create or replace function public.promopilot_campaign_end_date(
  p_dados jsonb,
  p_year_hint integer
)
returns date
language sql
immutable
as $$
  select max(
    public.promopilot_parse_campaign_date(
      coalesce(
        item ->> 'dataFim',
        item ->> 'data_fim',
        item ->> 'DATA FIM',
        item ->> 'DATA_FIM',
        ''
      ),
      p_year_hint
    )
  )
  from jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(p_dados, '[]'::jsonb)) = 'array'
        then coalesce(p_dados, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) as item;
$$;

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

create or replace function public.promopilot_sync_campaign_lifecycle()
returns trigger
language plpgsql
as $$
declare
  v_end_date date;
  v_keep_until timestamptz;
begin
  v_end_date := public.promopilot_campaign_end_date(new.dados, new.ano_validade);
  new.campaign_end_date := v_end_date;

  if v_end_date is not null then
    v_keep_until := (v_end_date::timestamp + interval '8 days')::timestamptz;

    if new.expires_at is null or new.expires_at < v_keep_until then
      new.expires_at := v_keep_until;
    end if;
  end if;

  if tg_op = 'UPDATE'
     and new.campaign_end_date is distinct from old.campaign_end_date
     and old.campaign_end_notified_at is null then
    new.campaign_end_notification_status := 'pending';
    new.campaign_end_notification_error := '';
  end if;

  return new;
end;
$$;

drop trigger if exists sync_campaign_lifecycle on public.campaigns;
create trigger sync_campaign_lifecycle
before insert or update of dados, ano_validade, campaign_end_date, expires_at
on public.campaigns
for each row execute function public.promopilot_sync_campaign_lifecycle();

drop trigger if exists sync_automatic_campaign_lifecycle on public.automatic_campaigns;
create trigger sync_automatic_campaign_lifecycle
before insert or update of dados, ano_validade, campaign_end_date, expires_at
on public.automatic_campaigns
for each row execute function public.promopilot_sync_campaign_lifecycle();

update public.campaigns
set
  campaign_end_date = public.promopilot_campaign_end_date(dados, ano_validade),
  campaign_end_notification_status = case
    when campaign_end_notified_at is not null then 'sent'
    else coalesce(nullif(campaign_end_notification_status, ''), 'pending')
  end;

update public.automatic_campaigns
set
  campaign_end_date = public.promopilot_campaign_end_date(dados, ano_validade),
  campaign_end_notification_status = case
    when campaign_end_notified_at is not null then 'sent'
    else coalesce(nullif(campaign_end_notification_status, ''), 'pending')
  end;

update public.campaigns
set expires_at = greatest(
  expires_at,
  (campaign_end_date::timestamp + interval '8 days')::timestamptz
)
where campaign_end_date is not null;

update public.automatic_campaigns
set expires_at = greatest(
  expires_at,
  (campaign_end_date::timestamp + interval '8 days')::timestamptz
)
where campaign_end_date is not null;

create index if not exists campaigns_end_notification_due_idx
  on public.campaigns (campaign_end_date, campaign_end_notification_status)
  where campaign_end_notified_at is null;

create index if not exists automatic_campaigns_end_notification_due_idx
  on public.automatic_campaigns (campaign_end_date, campaign_end_notification_status)
  where campaign_end_notified_at is null;
