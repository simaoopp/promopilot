create table if not exists public.automatic_campaigns (
  id text primary key,
  titulo text not null default 'Campanha automática',
  dados jsonb not null default '[]'::jsonb,
  ano_validade integer not null default extract(year from now())::integer,
  formato_etiqueta text not null default 'a6',
  origem text not null default 'automatico-email',
  created_by text not null default 'Sistema automático',
  created_by_email text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 days'),
  total_artigos integer not null default 0,
  store text not null default '',
  user_id uuid references auth.users(id) on delete set null,
  email_message_id text,
  email_subject text not null default '',
  email_from text not null default '',
  email_received_at timestamptz,
  processed_at timestamptz,
  status text not null default 'processed',
  pdf_url text not null default '',
  pdfs jsonb not null default '{}'::jsonb,
  error_message text not null default '',
  raw_email_text text not null default '',
  constraint automatic_campaigns_status_check check (
    status in ('pending', 'processing', 'processed', 'sent', 'error', 'failed')
  )
);

create index if not exists automatic_campaigns_store_created_idx
  on public.automatic_campaigns (store, created_at desc);

create index if not exists automatic_campaigns_store_expires_idx
  on public.automatic_campaigns (store, expires_at);

create unique index if not exists automatic_campaigns_email_store_unique_idx
  on public.automatic_campaigns (email_message_id, store)
  where email_message_id is not null;

alter table public.automatic_campaigns enable row level security;

drop policy if exists "automatic_campaigns_select_authenticated" on public.automatic_campaigns;
drop policy if exists "automatic_campaigns_insert_authenticated" on public.automatic_campaigns;
drop policy if exists "automatic_campaigns_update_authenticated" on public.automatic_campaigns;
drop policy if exists "automatic_campaigns_delete_authenticated" on public.automatic_campaigns;

create policy "automatic_campaigns_select_authenticated"
  on public.automatic_campaigns
  for select
  to authenticated
  using (true);

create policy "automatic_campaigns_insert_authenticated"
  on public.automatic_campaigns
  for insert
  to authenticated
  with check (true);

create policy "automatic_campaigns_update_authenticated"
  on public.automatic_campaigns
  for update
  to authenticated
  using (true)
  with check (true);

create policy "automatic_campaigns_delete_authenticated"
  on public.automatic_campaigns
  for delete
  to authenticated
  using (true);
