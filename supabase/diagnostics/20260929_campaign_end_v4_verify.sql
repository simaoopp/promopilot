-- PromoPilot · Campaign End V4 · read-only verification
-- Run in Supabase SQL Editor after the V4 migration.

-- 1) Active campaign-end triggers. Expected runtime triggers are V4 only.
select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation as event
from information_schema.triggers
where trigger_schema = 'public'
  and (
    trigger_name ilike '%campaign_end%'
    or trigger_name ilike '%campaign_lifecycle%'
  )
order by table_name, trigger_name, event;

-- 2) Event queue health.
select
  status,
  count(*) as total
from public.campaign_end_events_v4
group by status
order by status;

-- 3) Events that cannot be delivered safely because organization_id is missing.
select
  id,
  source_type,
  source_campaign_id,
  title,
  store,
  end_date,
  status
from public.campaign_end_events_v4
where organization_id is null
  and status not in ('sent', 'skipped')
order by end_date asc;

-- 4) Next due events.
select
  id,
  source_type,
  source_campaign_id,
  title,
  store,
  end_date,
  due_at,
  status,
  attempt_count,
  next_attempt_at,
  last_error
from public.campaign_end_events_v4
where status not in ('sent', 'skipped')
order by due_at asc
limit 50;

-- 5) Delivery ledger (emails intentionally masked in this diagnostic result).
select
  d.event_id,
  e.title,
  left(d.recipient_email, 2) || '***@' || split_part(d.recipient_email, '@', 2) as recipient,
  d.status,
  d.attempt_count,
  d.provider_message_id,
  d.sent_at,
  d.last_error
from public.campaign_end_event_deliveries_v4 d
join public.campaign_end_events_v4 e on e.id = d.event_id
order by d.created_at desc
limit 100;
