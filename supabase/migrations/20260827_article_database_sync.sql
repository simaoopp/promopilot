-- Admin-only article database synchronization history.
-- The API uses the service role and performs the authorization check server-side.

create table if not exists public.article_sync_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  user_email text not null default '',
  file_name text not null default '',
  columns jsonb not null default '[]'::jsonb,
  status text not null default 'processing' check (status in ('processing','completed','failed','cancelled')),
  total_rows integer not null default 0,
  processed_rows integer not null default 0,
  updated_rows integer not null default 0,
  inserted_rows integer not null default 0,
  unchanged_rows integer not null default 0,
  pvp1_changes integer not null default 0,
  pvp2_changes integer not null default 0,
  pvp3_changes integer not null default 0,
  estado_changes integer not null default 0,
  last_batch_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists article_sync_logs_created_idx on public.article_sync_logs(created_at desc);
create index if not exists article_sync_logs_user_idx on public.article_sync_logs(user_id, created_at desc);

alter table public.article_sync_logs enable row level security;
revoke all on public.article_sync_logs from anon, authenticated;
