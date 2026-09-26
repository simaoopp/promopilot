-- PromoPilot
-- Compatibilidade entre o campo legacy campaign_id e o novo source_campaign_id.
--
-- Motivo:
-- Algumas instalações já têm campaign_end_notifications.campaign_id NOT NULL.
-- O novo worker usa source_campaign_id. Sem sincronização, inserts novos podem
-- falhar com 23502 (campaign_id = null).
--
-- Esta migration NÃO remove a constraint NOT NULL.
-- Mantém os dois identificadores sincronizados para compatibilidade retroativa.

do $$
begin
  if to_regclass('public.campaign_end_notifications') is null then
    raise notice 'campaign_end_notifications ainda não existe; migration de compatibilidade ignorada.';
    return;
  end if;

  -- Normaliza registos antigos caso campaign_id tenha sido tornado nullable
  -- numa instalação intermédia.
  update public.campaign_end_notifications
  set campaign_id = source_campaign_id
  where campaign_id is null
    and source_campaign_id is not null;

  update public.campaign_end_notifications
  set source_campaign_id = campaign_id
  where source_campaign_id is null
    and campaign_id is not null;
end
$$;

create or replace function public.sync_campaign_end_notification_ids()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Novo modelo -> coluna legacy.
  if nullif(btrim(new.campaign_id), '') is null
     and nullif(btrim(new.source_campaign_id), '') is not null then
    new.campaign_id := new.source_campaign_id;
  end if;

  -- Legacy -> novo modelo.
  if nullif(btrim(new.source_campaign_id), '') is null
     and nullif(btrim(new.campaign_id), '') is not null then
    new.source_campaign_id := new.campaign_id;
  end if;

  return new;
end;
$$;

drop trigger if exists campaign_end_notifications_sync_ids
  on public.campaign_end_notifications;

create trigger campaign_end_notifications_sync_ids
before insert or update of campaign_id, source_campaign_id
on public.campaign_end_notifications
for each row
execute function public.sync_campaign_end_notification_ids();

-- Mantemos campaign_id NOT NULL se já estiver assim.
-- O trigger garante que inserts que apenas enviem source_campaign_id
-- continuam compatíveis com a estrutura antiga.

create index if not exists campaign_end_notifications_campaign_id_idx
  on public.campaign_end_notifications (campaign_id);

create index if not exists campaign_end_notifications_source_campaign_id_idx
  on public.campaign_end_notifications (source_campaign_id);

select pg_notify('pgrst', 'reload schema');
