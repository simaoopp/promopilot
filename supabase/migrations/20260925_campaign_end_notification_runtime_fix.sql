-- PromoPilot
-- Runtime fix: lifecycle de fim de campanha + arquivo seguro para o link do email.
-- Idempotente: pode ser executada mesmo que parte das colunas já exista.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- CAMPANHAS MANUAIS
-- ---------------------------------------------------------------------------
alter table if exists public.campaigns
  add column if not exists campaign_end_at timestamptz,
  add column if not exists end_notification_status text not null default 'skipped',
  add column if not exists end_notification_sent_at timestamptz,
  add column if not exists end_notification_message_id text not null default '',
  add column if not exists end_notification_error text not null default '',
  add column if not exists end_notification_attempts integer not null default 0,
  add column if not exists end_notification_last_attempt_at timestamptz,
  add column if not exists end_notification_recipients text[] not null default '{}'::text[];

-- ---------------------------------------------------------------------------
-- CAMPANHAS AUTOMÁTICAS
-- ---------------------------------------------------------------------------
alter table if exists public.automatic_campaigns
  add column if not exists campaign_end_at timestamptz,
  add column if not exists end_notification_status text not null default 'skipped',
  add column if not exists end_notification_sent_at timestamptz,
  add column if not exists end_notification_message_id text not null default '',
  add column if not exists end_notification_error text not null default '',
  add column if not exists end_notification_attempts integer not null default 0,
  add column if not exists end_notification_last_attempt_at timestamptz,
  add column if not exists end_notification_recipients text[] not null default '{}'::text[];

-- Campanhas Praia já existentes com data de fim e ainda não notificadas
-- voltam a ficar elegíveis. Isto corrige testes em que a data já tinha passado
-- e o frontend tinha gravado "skipped".
update public.campaigns
set end_notification_status = 'pending',
    end_notification_error = ''
where end_notification_sent_at is null
  and campaign_end_at is not null
  and lower(coalesce(store, '')) like '%praia%';

update public.automatic_campaigns
set end_notification_status = 'pending',
    end_notification_error = ''
where end_notification_sent_at is null
  and campaign_end_at is not null
  and lower(coalesce(store, '')) like '%praia%';

create index if not exists campaigns_end_notification_due_idx
  on public.campaigns (campaign_end_at, end_notification_sent_at)
  where campaign_end_at is not null
    and end_notification_sent_at is null;

create index if not exists automatic_campaigns_end_notification_due_idx
  on public.automatic_campaigns (campaign_end_at, end_notification_sent_at)
  where campaign_end_at is not null
    and end_notification_sent_at is null;

-- ---------------------------------------------------------------------------
-- ARQUIVO FINAL
-- Mantém um snapshot independente da retenção normal do histórico.
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_end_notifications (
  id uuid primary key default gen_random_uuid(),
  source_type text not null
    check (source_type in ('manual', 'automatic')),
  campaign_id text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  title text not null default 'Campanha',
  items jsonb not null default '[]'::jsonb,
  year_validity integer,
  article_count integer not null default 0,
  store text not null default '',
  campaign_created_at timestamptz,
  campaign_end_at timestamptz not null,
  recipients text[] not null default '{}'::text[],
  recipient_results jsonb not null default '{}'::jsonb,
  message_ids jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_end_notifications_campaign_unique
    unique (source_type, campaign_id)
);

create index if not exists campaign_end_notifications_store_end_idx
  on public.campaign_end_notifications (store, campaign_end_at desc);

create index if not exists campaign_end_notifications_org_idx
  on public.campaign_end_notifications (organization_id)
  where organization_id is not null;

alter table public.campaign_end_notifications enable row level security;

revoke all on public.campaign_end_notifications from anon, authenticated;

-- O browser nunca lê diretamente a tabela: usa uma RPC limitada pela loja.
drop policy if exists campaign_end_notifications_no_direct_access
  on public.campaign_end_notifications;

create policy campaign_end_notifications_no_direct_access
  on public.campaign_end_notifications
  for all
  to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- RPC usada pelo botão "Abrir campanha no PromoPilot".
-- Requer sessão e acesso à loja do snapshot.
-- ---------------------------------------------------------------------------
create or replace function public.get_campaign_end_archive(p_id text)
returns table (
  id uuid,
  source_type text,
  campaign_id text,
  title text,
  items jsonb,
  year_validity integer,
  article_count integer,
  store text,
  campaign_created_at timestamptz,
  campaign_end_at timestamptz,
  sent_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    n.id,
    n.source_type,
    n.campaign_id,
    n.title,
    n.items,
    n.year_validity,
    n.article_count,
    n.store,
    n.campaign_created_at,
    n.campaign_end_at,
    n.sent_at
  from public.campaign_end_notifications n
  where n.id::text = trim(coalesce(p_id, ''))
    and auth.uid() is not null
    and public.can_access_store(n.store)
  limit 1;
$$;

revoke all on function public.get_campaign_end_archive(text) from public;
grant execute on function public.get_campaign_end_archive(text) to authenticated;

comment on table public.campaign_end_notifications is
  'Snapshot final e idempotência das notificações de fim de campanha.';
