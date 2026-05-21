-- Mantém campanhas/etiquetas automáticas apenas durante 5 dias.
-- A limpeza aplicacional apaga linhas e PDFs no Supabase Storage; este migration
-- mantém a base de dados alinhada para novas linhas e consultas eficientes.

alter table public.automatic_campaigns
  alter column expires_at set default (now() + interval '5 days');

create index if not exists automatic_campaigns_created_at_idx
  on public.automatic_campaigns (created_at);

create index if not exists automatic_campaigns_expires_at_idx
  on public.automatic_campaigns (expires_at);
