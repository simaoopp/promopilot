-- PromoPilot · Campaign lifecycle / end-of-campaign notifications
-- Server-owned ledger. Keeps the campaign snapshot even after history cleanup,
-- so the email deep-link can still show the ended campaign safely.

create table if not exists public.campaign_end_notifications (
  id uuid primary key default gen_random_uuid(),
  notification_key text not null unique,
  organization_id uuid references public.organizations(id) on delete cascade,
  source text not null check (source in ('manual', 'automatic')),
  campaign_id text not null,
  store text not null,
  campaign_title text not null default 'Campanha',
  campaign_end_date date not null,
  campaign_snapshot jsonb not null default '{}'::jsonb,
  recipients jsonb not null default '[]'::jsonb,
  deliveries jsonb not null default '[]'::jsonb,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sending', 'sent', 'partial', 'failed', 'waiting_recipients')),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_end_notifications_due_idx
  on public.campaign_end_notifications (status, campaign_end_date);

create index if not exists campaign_end_notifications_org_store_idx
  on public.campaign_end_notifications (organization_id, store, campaign_end_date desc);

alter table public.campaign_end_notifications enable row level security;
revoke all on public.campaign_end_notifications from anon, authenticated;

comment on table public.campaign_end_notifications is
  'Server-owned ledger for end-of-campaign emails and authenticated deep-link snapshots.';
