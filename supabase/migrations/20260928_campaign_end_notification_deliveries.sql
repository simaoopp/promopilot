create table if not exists public.campaign_end_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_type text not null check (campaign_type in ('manual', 'automatic')),
  campaign_id text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  store text not null default '',
  campaign_title text not null default '',
  campaign_end_date date not null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_email text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempt_count integer not null default 0,
  provider_message_id text not null default '',
  last_error text not null default '',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_type, campaign_id, recipient_email)
);

create index if not exists campaign_end_notifications_status_idx
  on public.campaign_end_notification_deliveries (status, campaign_end_date);

create index if not exists campaign_end_notifications_campaign_idx
  on public.campaign_end_notification_deliveries (campaign_type, campaign_id);

alter table public.campaign_end_notification_deliveries enable row level security;
revoke all on public.campaign_end_notification_deliveries from anon, authenticated;

create or replace function public.touch_campaign_end_notification_delivery()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists campaign_end_notification_delivery_updated_at
  on public.campaign_end_notification_deliveries;

create trigger campaign_end_notification_delivery_updated_at
before update on public.campaign_end_notification_deliveries
for each row
execute function public.touch_campaign_end_notification_delivery();
