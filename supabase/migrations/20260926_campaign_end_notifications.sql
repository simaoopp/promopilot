-- PromoPilot · Campaign Lifecycle
-- Email idempotente no fim de campanhas + snapshot durável para deep-links.

create extension if not exists pgcrypto;

create table if not exists public.campaign_end_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  campaign_source text not null,
  campaign_id text not null,
  store text not null,
  ended_on date not null,
  campaign_title text not null default 'Campanha',
  total_articles integer not null default 0,
  campaign_snapshot jsonb not null default '{}'::jsonb,
  recipient_emails text[] not null default '{}'::text[],
  delivered_to text[] not null default '{}'::text[],
  failed_to jsonb not null default '{}'::jsonb,
  provider_message_ids jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  sent_at timestamptz,
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_end_notifications_source_check
    check (campaign_source in ('manual', 'automatic')),
  constraint campaign_end_notifications_status_check
    check (status in ('pending', 'partial', 'sent', 'error', 'no_recipients')),
  constraint campaign_end_notifications_unique
    unique (campaign_source, campaign_id, store)
);

create index if not exists campaign_end_notifications_store_ended_idx
  on public.campaign_end_notifications (store, ended_on desc);

create index if not exists campaign_end_notifications_status_idx
  on public.campaign_end_notifications (status, created_at);

alter table public.campaign_end_notifications enable row level security;
revoke all on public.campaign_end_notifications from anon, authenticated;

-- O detalhe é servido exclusivamente pelo backend autenticado com service_role.
drop policy if exists campaign_end_notifications_authenticated on public.campaign_end_notifications;

-- Evita que campanhas atuais da Praia desapareçam antes de o worker conseguir
-- observar a data de fim. Novas campanhas já calculam a retenção na aplicação.
do $$
begin
  if to_regclass('public.campaigns') is not null then
    update public.campaigns
       set expires_at = greatest(expires_at, now() + interval '45 days')
     where lower(trim(store)) = lower('Loja da Praia');
  end if;

  if to_regclass('public.automatic_campaigns') is not null then
    update public.automatic_campaigns
       set expires_at = greatest(expires_at, now() + interval '45 days')
     where lower(trim(store)) = lower('Loja da Praia');
  end if;
end $$;
