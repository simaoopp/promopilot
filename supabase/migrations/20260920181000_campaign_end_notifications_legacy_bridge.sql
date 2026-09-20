begin;

-- Desativa a implementação antiga da fila.
drop trigger if exists capture_manual_campaign_end_notification
  on public.campaigns;

drop trigger if exists capture_automatic_campaign_end_notification
  on public.automatic_campaigns;

drop trigger if exists campaign_end_notifications_touch_updated_at
  on public.campaign_end_notifications;

drop function if exists public.claim_campaign_end_notifications(integer);
drop function if exists public.capture_campaign_end_notification();

-- Adiciona o schema esperado pelo worker atual.
alter table public.campaign_end_notifications
  add column if not exists campaign_id text,
  add column if not exists year_validity integer,
  add column if not exists article_count integer not null default 0,
  add column if not exists campaign_created_at timestamptz,
  add column if not exists campaign_end_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists recipient_emails text[] not null default '{}'::text[],
  add column if not exists recipient_delivery jsonb not null default '{}'::jsonb;

-- Remove o CHECK antigo antes de converter processing/failed.
alter table public.campaign_end_notifications
  drop constraint if exists campaign_end_notifications_status_check;

-- Preserva os dados já existentes na fila antiga.
update public.campaign_end_notifications
set
  campaign_id = coalesce(campaign_id, source_campaign_id),
  year_validity = coalesce(year_validity, campaign_year),
  article_count = case
    when article_count > 0 then article_count
    else coalesce(total_items, 0)
  end,
  campaign_created_at = coalesce(campaign_created_at, created_at),
  campaign_end_at = coalesce(
    campaign_end_at,
    (
      end_date::timestamp
      + interval '23 hours 59 minutes 59 seconds'
    ) at time zone 'Atlantic/Azores'
  ),
  sent_at = coalesce(sent_at, notified_at),
  status = case status
    when 'processing' then 'sending'
    when 'failed' then 'error'
    else status
  end;

-- As colunas antigas eram obrigatórias, mas os novos inserts não as usam.
alter table public.campaign_end_notifications
  alter column source_campaign_id drop not null,
  alter column end_date drop not null;

alter table public.campaign_end_notifications
  alter column campaign_id set not null;

-- Estados esperados pelo worker novo.
alter table public.campaign_end_notifications
  add constraint campaign_end_notifications_status_v2_check
  check (
    status in ('pending', 'sending', 'sent', 'error', 'skipped')
  );

-- A migration nova recriará o índice "due" com campaign_end_at.
drop index if exists public.campaign_end_notifications_due_idx;
drop index if exists public.campaign_end_notifications_store_idx;

commit;