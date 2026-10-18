begin;
set local lock_timeout = '5s';
-- Fail before changing persistent data if the existing tenant model is incomplete.
do $$
declare n integer; t text; invalid boolean; captured boolean:=false; legacy_users jsonb;
begin
 foreach t in array array['organizations','stores','organization_members','profiles'] loop
  if to_regclass('public.'||t) is null then raise exception 'Fase Zero: tabela obrigatória em falta: %',t; end if;
 end loop;
 if to_regclass('public.platform_migration_snapshots') is not null then
  execute 'select exists(select 1 from public.platform_migration_snapshots where migration_key=''phase-zero-20261015'')' into captured;
 end if;
 if captured then return; end if;
 -- The administrator explicitly reviews legacy exceptions; no personal identifier is shipped in SQL.
 if nullif(current_setting('promopilot.legacy_admin_user_ids',true),'') is null then
  raise exception 'Pré-verificação: executar primeiro preparePlatformMigration.js para rever os acessos administrativos legados.';
 end if;
 legacy_users:=current_setting('promopilot.legacy_admin_user_ids')::jsonb;
 if jsonb_typeof(legacy_users)<>'array' or jsonb_array_length(legacy_users)>100 then
  raise exception 'Pré-verificação: lista de acessos legados inválida';
 end if;
 if exists(select 1 from jsonb_array_elements_text(legacy_users) x(id)
  where not exists(select 1 from auth.users u where u.id=x.id::uuid and u.email_confirmed_at is not null
   and (u.banned_until is null or u.banned_until<now())
   and exists(select 1 from public.organization_members m where m.user_id=u.id and m.status='active'))) then
  raise exception 'Pré-verificação: conta legada não verificada ou sem membership ativa';
 end if;
 select count(*) into n from public.organizations where lower(trim(name))='expert';
 if n<>1 then raise exception 'Pré-verificação: esperado um único registo Expert, encontrados %. Resolver antes de migrar.',n; end if;
 if exists(select 1 from public.organization_members m join public.stores s on s.id=m.store_id where s.organization_id<>m.organization_id) then
  raise exception 'Pré-verificação: membership ligada a loja de outra organização';
 end if;
 if exists(select 1 from public.organization_members where status='active' and role in ('store_user','viewer','support') and store_id is null) then
  raise exception 'Pré-verificação: associar os colaboradores a uma loja explícita antes da migração; acessos a várias lojas precisam de revisão administrativa.';
 end if;
 if exists(select 1 from public.organization_members m join public.profiles p on p.id=m.user_id join public.stores s on s.id=m.store_id
  where m.status='active' and exists(select 1 from unnest(coalesce(p.allowed_stores,'{}')) x where lower(trim(x)) not in (lower(trim(s.name)),lower(trim(s.code))))) then
  raise exception 'Pré-verificação: acessos legados a várias lojas precisam de reconciliação antes da migração; nenhuma permissão foi alterada.';
 end if;
 -- A null default organization used to let named legacy collaborators disappear
 -- from the new access model. Incomplete profiles without a store stay pending.
 if exists(select 1 from public.profiles p where nullif(trim(p.store),'') is not null
  and not exists(select 1 from public.organization_members m where m.user_id=p.id)) then
  raise exception 'Pré-verificação: perfis com loja mas sem vínculo. Executar phase_zero_preflight.sql para rever todos os bloqueios.';
 end if;
 if exists(select 1 from public.profiles p join public.organization_members m on m.user_id=p.id
  where p.role in ('admin','owner') and m.status='active' and (m.store_id is not null or m.role not in ('admin','owner'))) then
  raise exception 'Pré-verificação: administrador legado limitado a uma loja ou função inferior. Reconciliar o acesso da organização; não atribuir CEO global automaticamente.';
 end if;
 -- Do not guess tenant ownership or silently hide legacy data.
 foreach t in array array['articles','campaigns','automatic_campaigns','campaign_end_events_v4'] loop
  if to_regclass('public.'||t) is null then continue; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='organization_id') then
   raise exception 'Pré-verificação: falta organization_id em %',t;
  end if;
  execute format('select exists(select 1 from public.%I where organization_id is null)',t) into invalid;
  if invalid then raise exception 'Pré-verificação: % contém dados sem organização. Resolver a propriedade antes de migrar.',t; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='store') then
   execute format('select exists(select 1 from public.%I d where coalesce(trim(d.store),'''')<>'''' and (select count(*) from public.stores s where s.organization_id=d.organization_id and (lower(trim(s.name))=lower(trim(d.store)) or lower(trim(s.code))=lower(trim(d.store))))<>1)',t) into invalid;
   if invalid then raise exception 'Pré-verificação: % tem lojas sem correspondência única. Não foram alterados dados.',t; end if;
  end if;
 end loop;
 if exists(select 1 from public.profiles p where p.default_organization_id is not null and not exists(select 1 from public.organization_members m where m.user_id=p.id and m.organization_id=p.default_organization_id)) then
  raise exception 'Pré-verificação: existem perfis com organização mas sem membership. Rever acessos antes de migrar.';
 end if;
end $$;

-- Existing tables must match the contract; never guess how to convert billing
-- data (for example legacy plan_code into plan_id). Report all missing columns.
do $$
declare incompatible text;
begin
 select string_agg(format('%s.%s (%s)',v.table_name,v.column_name,v.udt_name),', ' order by v.table_name,v.column_name)
 into incompatible
 from (values
  ('plans','id','text'),('plans','name','text'),
  ('subscriptions','id','uuid'),('subscriptions','organization_id','uuid'),
  ('subscriptions','plan_id','text'),('subscriptions','provider','text'),
  ('subscriptions','status','text'),('subscriptions','updated_at','timestamptz'),
  ('audit_logs','id','uuid'),('audit_logs','organization_id','uuid'),
  ('audit_logs','user_id','uuid'),('audit_logs','action','text'),('audit_logs','entity_type','text'),
  ('audit_logs','before','jsonb'),('audit_logs','after','jsonb'),('audit_logs','metadata','jsonb'),
  ('audit_logs','created_at','timestamptz')
 ) v(table_name,column_name,udt_name)
 left join information_schema.columns c on c.table_schema='public'
  and c.table_name=v.table_name and c.column_name=v.column_name
 where to_regclass('public.'||v.table_name) is not null
  and c.udt_name is distinct from v.udt_name;
 if incompatible is not null then
  raise exception 'Fase Zero: colunas administrativas em falta ou incompatíveis: %. Nenhum dado foi convertido; rever o esquema existente.',incompatible;
 end if;
end $$;

-- Some deployed databases have the tenant model but not the optional SaaS tables.
-- Create only missing administrative tables, inside this same transaction. Do not
-- seed prices, subscribe tenants, reassign data or replay historical migrations.
do $$
declare created_tables jsonb := '[]'::jsonb; t text;
begin
 if to_regclass('public.plans') is null then
  create table public.plans (
   id text primary key, name text not null,
   status text not null default 'active' check(status in ('active','hidden','deprecated')),
   price_monthly_cents integer not null default 0, currency text not null default 'EUR',
   features jsonb not null default '{}', created_at timestamptz not null default now()
  );
  created_tables := created_tables || '"plans"'::jsonb;
 end if;
 if to_regclass('public.subscriptions') is null then
  create table public.subscriptions (
   id uuid primary key default gen_random_uuid(),
   organization_id uuid not null unique references public.organizations(id) on delete cascade,
   plan_id text references public.plans(id),
   status text not null default 'manual' check(status in ('trialing','active','past_due','cancelled','manual')),
   provider text not null default 'manual' check(provider in ('manual','stripe','paddle')),
   provider_customer_id text, provider_subscription_id text,
   trial_ends_at timestamptz, current_period_start timestamptz, current_period_end timestamptz,
   created_at timestamptz not null default now(), updated_at timestamptz not null default now()
  );
  created_tables := created_tables || '"subscriptions"'::jsonb;
 end if;
 if to_regclass('public.audit_logs') is null then
  create table public.audit_logs (
   id uuid primary key default gen_random_uuid(),
   organization_id uuid references public.organizations(id) on delete cascade,
   user_id uuid references auth.users(id) on delete set null,
   action text not null, entity_type text not null, entity_id uuid,
   before jsonb, after jsonb, metadata jsonb, request_id text, ip text, user_agent text,
   created_at timestamptz not null default now()
  );
  created_tables := created_tables || '"audit_logs"'::jsonb;
 end if;
 -- Supabase can grant access through default privileges. Secure new tables
 -- before commit; reads/writes go through the checked administrative RPCs.
 for t in select jsonb_array_elements_text(created_tables) loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 perform set_config('promopilot.phase_zero_created_tables',created_tables::text,true);
end $$;

-- The supplied tenant schema can lack these unique keys. They are necessary
-- for composite foreign keys and ON CONFLICT, even when only partial indexes
-- exist. Refuse duplicates instead of deleting or merging memberships/billing.
do $$
declare spec record; columns_sql text; not_null_sql text; duplicated boolean;
begin
 for spec in select * from (values
  ('organization_members',array['organization_id','user_id'],'phase_zero_members_org_user_key'),
  ('stores',array['organization_id','code'],'phase_zero_stores_org_code_key'),
  ('subscriptions',array['organization_id'],'phase_zero_subscriptions_org_key')
 ) v(table_name,key_columns,index_name) loop
  if exists(select 1 from pg_index i where i.indrelid=to_regclass('public.'||spec.table_name)
   and i.indisunique and i.indisvalid and i.indimmediate and i.indpred is null
   and i.indexprs is null and i.indnkeyatts=cardinality(spec.key_columns)
   and (select array_agg(a.attname::text order by a.attname)
    from unnest(i.indkey::smallint[]) with ordinality k(attnum,position)
    join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
    where k.position<=i.indnkeyatts) = (select array_agg(c order by c) from unnest(spec.key_columns) c)) then
   continue;
  end if;
  select string_agg(format('%I',c),', '),string_agg(format('%I is not null',c),' and ')
   into columns_sql,not_null_sql from unnest(spec.key_columns) c;
  execute format('select exists(select 1 from public.%I where %s group by %s having count(*)>1)',spec.table_name,not_null_sql,columns_sql) into duplicated;
  if duplicated then
   raise exception 'Fase Zero: registos duplicados em %(%). Rever os vínculos existentes; nenhum registo foi removido.',spec.table_name,columns_sql;
  end if;
  if to_regclass('public.'||spec.index_name) is not null then
   raise exception 'Fase Zero: índice % existente mas incompatível; rever a sua definição.',spec.index_name;
  end if;
  execute format('create unique index %I on public.%I (%s)',spec.index_name,spec.table_name,columns_sql);
 end loop;
end $$;

create table if not exists public.platform_migration_snapshots (
 migration_key text primary key, captured_at timestamptz not null default now(), expert_id uuid not null,
 snapshot jsonb not null
);
insert into public.platform_migration_snapshots(migration_key,expert_id,snapshot)
select 'phase-zero-20261015',o.id,jsonb_build_object(
 'foundation_tables_created',current_setting('promopilot.phase_zero_created_tables')::jsonb,
 'legacy_admin_user_ids',coalesce(nullif(current_setting('promopilot.legacy_admin_user_ids',true),''),'[]')::jsonb,
 'organizations',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.organizations x),
 'stores',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.stores x),
 'memberships',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.organization_members x),
 'profiles',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.profiles x),
 'subscriptions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.subscriptions x),
 'plans',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.plans x),
 'functions',(select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl)),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('is_platform_admin','is_app_admin','can_access_store','resolve_article_rpc_organization','claim_campaign_end_events_v4')),
 'table_grants',(select coalesce(jsonb_agg(to_jsonb(g)),'[]') from information_schema.role_table_grants g where table_schema='public'),
 'policies',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from pg_policies x where schemaname in ('public','storage')))
from public.organizations o where lower(trim(o.name))='expert'
on conflict(migration_key) do nothing;

create table if not exists public.platform_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null default 'admin' check(role in ('ceo','admin')),
 status text not null default 'active' check(status in ('active','disabled')),
 created_at timestamptz not null default now()
);
create table if not exists public.feature_modules (
 module_key text primary key check(module_key ~ '^[a-z][a-z0-9_]{1,50}$'),
 name text not null, description text not null default '', category text not null default 'core',
 status text not null default 'available' check(status in ('available','disabled')),
 implemented boolean not null default false, dependencies text[] not null default '{}'
);
create table if not exists public.module_permissions (
 permission_key text primary key, module_key text not null references public.feature_modules(module_key),
 action text not null check(action in ('read','write','manage')), description text not null default ''
);
create table if not exists public.module_pages (
 page_key text primary key, module_key text not null references public.feature_modules(module_key),
 permission_key text not null references public.module_permissions(permission_key),
 path text not null unique check(path ~ '^/[A-Za-z0-9/_:-]*$'), name text not null,
 nav_order integer not null default 100, visible boolean not null default true
);
alter table public.module_pages add column if not exists show_in_navigation boolean not null default true;
create table if not exists public.organization_features (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 module_key text not null references public.feature_modules(module_key),
 enabled boolean not null, source text not null default 'ceo' check(source in ('ceo','migration')),
 updated_at timestamptz not null default now(), primary key(organization_id,module_key)
);
create unique index if not exists stores_id_org_unique on public.stores(id,organization_id);
do $$ begin
 if not exists(select 1 from pg_constraint where conname='organization_members_store_scope' and conrelid='public.organization_members'::regclass) then
  alter table public.organization_members add constraint organization_members_store_scope foreign key(store_id,organization_id) references public.stores(id,organization_id);
 end if;
end $$;
create table if not exists public.store_features (
 organization_id uuid not null, store_id uuid not null, module_key text not null references public.feature_modules(module_key),
 enabled boolean not null, primary key(store_id,module_key),
 foreign key(store_id,organization_id) references public.stores(id,organization_id) on delete cascade
);
create table if not exists public.plan_features (
 plan_id text not null references public.plans(id) on delete cascade,
 module_key text not null references public.feature_modules(module_key), enabled boolean not null,
 primary key(plan_id,module_key)
);
create table if not exists public.organization_role_permissions (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 role text not null check(role in ('owner','admin','manager','store_user','viewer','support')),
 permission_key text not null references public.module_permissions(permission_key),
 allowed boolean not null, primary key(organization_id,role,permission_key)
);
create table if not exists public.user_permissions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 user_id uuid not null, store_id uuid, permission_key text not null references public.module_permissions(permission_key),
 allowed boolean not null,
 foreign key(organization_id,user_id) references public.organization_members(organization_id,user_id) on delete cascade,
 foreign key(store_id,organization_id) references public.stores(id,organization_id) on delete cascade,
 unique nulls not distinct (organization_id,user_id,store_id,permission_key)
);
create table if not exists public.platform_settings (
 id boolean primary key default true check(id), display_name text not null default 'PromoPilot',
 support_email text not null default 'geral@promopilot.pt'
);
insert into public.platform_settings(id) values(true) on conflict do nothing;

insert into public.feature_modules(module_key,name,description,category,implemented,dependencies) values
 ('dashboard','Dashboard','Visão geral do trabalho em loja','core',true,'{}'),
 ('products','Produtos','Pesquisa e catálogo de artigos','core',true,'{}'),
 ('campaigns','Campanhas','Campanhas manuais e importação Excel','core',true,'{products}'),
 ('labels','Etiquetas','Catálogo, scan e impressão','core',true,'{products}'),
 ('dossiers','Dossiers','Propostas e dossiers comerciais','core',true,'{products}'),
 ('automations','Automatizações','Campanhas por email e notificações','core',true,'{campaigns}'),
 ('stores','Lojas','Estabelecimentos e equipa','core',true,'{}'),
 ('reports','Histórico','Campanhas terminadas e histórico','core',true,'{campaigns}'),
 ('ai','Assistente','Assistente de produto e vendedor','core',true,'{products}'),
 ('pos','POS','Autorização do futuro ponto de venda','pos',false,'{}'),
 ('sales','Vendas','Registo de vendas','pos',false,'{pos}'),
 ('cash','Caixa','Operações de caixa','pos',false,'{pos}'),
 ('inventory','Stock POS','Inventário do ponto de venda','pos',false,'{pos}'),
 ('restaurant','Restaurantes','Operação de restauração','pos',false,'{pos}'),
 ('tables','Mesas','Gestão de mesas','pos',false,'{restaurant}'),
 ('kitchen','Cozinha','Operação de cozinha','pos',false,'{restaurant}'),
 ('pos_reports','Relatórios POS','Relatórios de vendas e caixa','pos',false,'{pos}'),
 ('pos_settings','Configurações POS','Configuração do ponto de venda','pos',false,'{pos}')
on conflict(module_key) do nothing;
insert into public.module_permissions(permission_key,module_key,action,description)
select m.module_key||'.'||a.action,m.module_key,a.action,m.name||' / '||a.action
from public.feature_modules m cross join (values('read'),('write'),('manage')) a(action)
on conflict do nothing;
insert into public.module_pages(page_key,module_key,permission_key,path,name,nav_order) values
 ('home','dashboard','dashboard.read','/Homepage','Início',10),
 ('manual','campaigns','campaigns.write','/EtiquetasCampanha','Campanha manual',20),
 ('catalog','labels','labels.read','/Etiquetas','Catálogo e scan',30),
 ('excel','campaigns','campaigns.write','/EtiquetasCampanhaExcel','Importação Excel',40),
 ('dossiers','dossiers','dossiers.read','/OrcamentosDossiers','Dossiers',50),
 ('pos','pos','pos.read','/POS','POS',60)
on conflict do nothing;

insert into public.module_pages(page_key,module_key,permission_key,path,name,nav_order,visible,show_in_navigation)
values('ended','reports','reports.read','/Campanhas/terminadas/:id','Detalhe de campanha terminada',70,true,false)
on conflict do nothing;

do $seed$ begin
if not exists(select 1 from public.platform_migration_snapshots where migration_key='phase-zero-20261015' and snapshot @> '{"entitlements_seeded":true}'::jsonb) then
-- Freeze the existing module entitlement for all existing tenants, without enabling POS.
insert into public.organization_features(organization_id,module_key,enabled,source)
select o.id,m.module_key,m.category='core','migration'
from public.organizations o cross join public.feature_modules m
where exists(select 1 from public.platform_migration_snapshots s,
 jsonb_array_elements(s.snapshot->'organizations') x where s.migration_key='phase-zero-20261015' and (x->>'id')::uuid=o.id)
on conflict do nothing;

-- Default action matrix respects existing row policies; it never replaces their row scope.
insert into public.organization_role_permissions(organization_id,role,permission_key,allowed)
select o.id,r.role,p.permission_key,
 case when m.category='core' then p.action<>'manage' or r.role in ('owner','admin')
 else r.role in ('owner','admin') or (p.action='read' and r.role='manager') end
from public.organizations o cross join public.module_permissions p join public.feature_modules m using(module_key)
cross join (values('owner'),('admin'),('manager'),('store_user'),('viewer'),('support')) r(role)
on conflict do nothing;
-- Preserve explicit existing import privilege as a tenant permission, never as CEO status.
insert into public.user_permissions(organization_id,user_id,permission_key,allowed)
select m.organization_id,m.user_id,p.permission,true from public.organization_members m
join public.platform_migration_snapshots s on s.migration_key='phase-zero-20261015'
cross join (values('products.manage'),('stores.manage')) p(permission)
where m.user_id in (select value::uuid from jsonb_array_elements_text(s.snapshot->'legacy_admin_user_ids')) and m.status='active'
on conflict do nothing;

update public.platform_migration_snapshots set snapshot=snapshot||'{"entitlements_seeded":true}'::jsonb where migration_key='phase-zero-20261015';
end if; end $seed$;

create table if not exists public.platform_user_contexts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 organization_id uuid not null, store_id uuid,
 foreign key(organization_id,user_id) references public.organization_members(organization_id,user_id) on delete cascade,
 foreign key(store_id,organization_id) references public.stores(id,organization_id) on delete cascade
);
alter table public.platform_user_contexts enable row level security;
revoke all on public.platform_user_contexts from anon,authenticated;
grant all on public.platform_user_contexts to service_role;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.platform_admins a join auth.users u on u.id=a.user_id
 where a.user_id=auth.uid() and a.status='active' and u.email_confirmed_at is not null
 and (u.banned_until is null or u.banned_until<now()));
$$;
-- Legacy SQL helper must not interpret an organisation administrator as global.
create or replace function public.is_app_admin() returns boolean language sql stable security definer set search_path='' as $$
 select public.is_platform_admin();
$$;

create or replace function public.platform_org_module(p_org uuid,p_module text,p_seen text[] default '{}') returns boolean
language plpgsql stable security definer set search_path='' as $$
declare m public.feature_modules%rowtype; enabled boolean; dep text;
begin
 if p_org is null or p_module=any(p_seen) then return false; end if;
 if not exists(select 1 from public.organizations where id=p_org and status in ('active','trialing','past_due')) then return false; end if;
 select * into m from public.feature_modules where module_key=p_module;
 if not found or m.status<>'available' then return false; end if;
 select f.enabled into enabled from public.organization_features f where f.organization_id=p_org and f.module_key=p_module;
 if enabled is null then
  select pf.enabled into enabled from public.subscriptions s join public.plan_features pf on pf.plan_id=s.plan_id
  where s.organization_id=p_org and s.status in ('active','trialing','manual','past_due') and pf.module_key=p_module;
 end if;
 if not coalesce(enabled,false) then return false; end if;
 foreach dep in array m.dependencies loop
  if not public.platform_org_module(p_org,dep,p_seen||p_module) then return false; end if;
 end loop;
 return true;
end $$;

create or replace function public.platform_store_module(p_org uuid,p_store uuid,p_module text,p_seen text[] default '{}') returns boolean
language plpgsql stable security definer set search_path='' as $$
declare dep text;
begin
 if not public.platform_org_module(p_org,p_module) or p_module=any(p_seen) then return false; end if;
 if p_store is not null then
  if not exists(select 1 from public.stores where id=p_store and organization_id=p_org and status='active') then return false; end if;
  if exists(select 1 from public.store_features where store_id=p_store and organization_id=p_org and module_key=p_module and not enabled) then return false; end if;
 end if;
 for dep in select unnest(dependencies) from public.feature_modules where module_key=p_module loop
  if not public.platform_store_module(p_org,p_store,dep,p_seen||p_module) then return false; end if;
 end loop;
 return true;
end $$;

create or replace function public.platform_user_permission(p_user uuid,p_org uuid,p_permission text,p_store uuid default null) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare m public.organization_members%rowtype; mod text; role_allow boolean; chosen_store uuid;
begin
 if p_user is null then return false; end if;
 select p.module_key into mod from public.module_permissions p join public.feature_modules f using(module_key)
 where p.permission_key=p_permission and f.implemented;
 if mod is null then return false; end if;
 select * into m from public.organization_members where organization_id=p_org and user_id=p_user and status='active';
 if not found then return false; end if;
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null and (banned_until is null or banned_until<now())) then return false; end if;
 chosen_store:=coalesce(p_store,m.store_id,(select c.store_id from public.platform_user_contexts c where c.user_id=p_user and c.organization_id=p_org));
 if m.store_id is not null and chosen_store<>m.store_id then return false; end if;
 if not public.platform_store_module(p_org,chosen_store,mod) then return false; end if;
 -- If no store was selected, a store-specific deny cannot be bypassed by omitting it.
 if chosen_store is null and exists(select 1 from public.stores s where s.organization_id=p_org and s.status='active' and not public.platform_store_module(p_org,s.id,mod)) then return false; end if;
 if exists(select 1 from public.user_permissions u where u.organization_id=p_org and u.user_id=p_user
  and u.permission_key=p_permission and not u.allowed and (u.store_id is null or u.store_id=chosen_store or chosen_store is null)) then return false; end if;
 if exists(select 1 from public.user_permissions u where u.organization_id=p_org and u.user_id=p_user
  and u.permission_key=p_permission and u.allowed and (u.store_id is null or u.store_id=chosen_store)) then return true; end if;
 select allowed into role_allow from public.organization_role_permissions where organization_id=p_org and role=m.role and permission_key=p_permission;
 return coalesce(role_allow,false);
end $$;

create or replace function public.platform_permission(p_org uuid,p_permission text,p_store uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
 select public.platform_user_permission(auth.uid(),p_org,p_permission,p_store);
$$;

create or replace function public.platform_resolve_org(p_org uuid default null) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare chosen uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 chosen:=p_org;
 if chosen is null then select c.organization_id into chosen from public.platform_user_contexts c join public.organization_members m on m.organization_id=c.organization_id and m.user_id=c.user_id where c.user_id=auth.uid() and m.status='active'; end if;
 if chosen is null then
  select m.organization_id into chosen from public.organization_members m left join public.profiles p on p.id=m.user_id
  join public.organizations o on o.id=m.organization_id
  where m.user_id=auth.uid() and m.status='active' and o.status in ('active','trialing','past_due')
  order by (m.organization_id=p.default_organization_id) desc nulls last,m.created_at,m.organization_id limit 1;
 end if;
 if chosen is not null and not exists(select 1 from public.organization_members where organization_id=chosen and user_id=auth.uid() and status='active') then
  raise exception 'Forbidden organization' using errcode='42501';
 end if;
 return chosen;
end $$;
create or replace function public.resolve_article_rpc_organization(p_organization_id uuid default null) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare org uuid;
begin
 if auth.role()='service_role' and p_organization_id is not null then return p_organization_id; end if;
 org:=public.platform_resolve_org(p_organization_id);
 if not public.platform_permission(org,'products.read') then raise exception 'Forbidden products' using errcode='42501'; end if;
 return org;
end $$;

create or replace function public.platform_row_access(p_org uuid,p_store text,p_permission text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare store_id uuid; n integer;
begin
 if p_org is null then return false; end if;
 if coalesce(trim(p_store),'')<>'' then
  select count(*),(array_agg(s.id))[1] into n,store_id from public.stores s where s.organization_id=p_org
   and (lower(trim(s.name))=lower(trim(p_store)) or lower(trim(s.code))=lower(trim(p_store)) or s.id::text=p_store);
  if n<>1 then return false; end if;
 end if;
 return public.platform_permission(p_org,p_permission,store_id);
end $$;


create or replace function public.can_access_store(target_store text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare org uuid; member public.organization_members%rowtype;
begin
 org:=public.platform_resolve_org();
 select * into member from public.organization_members where organization_id=org and user_id=auth.uid() and status='active';
 if not found then return false; end if;
 return exists(select 1 from public.stores s where s.organization_id=org and s.status='active'
  and (s.name=target_store or s.code=target_store) and (member.store_id is null or member.store_id=s.id));
end $$;
revoke all on function public.can_access_store(text) from public,anon;
grant execute on function public.can_access_store(text) to authenticated,service_role;

create or replace function public.platform_system_module(p_org uuid,p_store text,p_module text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare sid uuid; n integer;
begin
 select count(*),(array_agg(s.id))[1] into n,sid from public.stores s where s.organization_id=p_org
  and (lower(trim(s.name))=lower(trim(p_store)) or lower(trim(s.code))=lower(trim(p_store)));
 if n<>1 then return false; end if;
 return public.platform_store_module(p_org,sid,p_module);
end $$;
-- Filter eligibility BEFORE claiming an event, incrementing attempts or acquiring its lock.
do $install_claim$
begin
 if to_regclass('public.campaign_end_events_v4') is not null then
  execute $definition$
  create or replace function public.claim_campaign_end_events_v4(p_limit integer default 25,p_max_attempts integer default 24)
  returns setof public.campaign_end_events_v4 language plpgsql security definer set search_path='' as $body$
  begin
   return query with due as (
    select e.id from public.campaign_end_events_v4 e where e.due_at<=now()
     and coalesce(e.next_attempt_at,e.due_at)<=now()
     and e.attempt_count<greatest(1,least(coalesce(p_max_attempts,24),100))
     and public.platform_system_module(e.organization_id,e.store,'automations')
     and (e.status in ('pending','failed','partial','waiting_recipients') or (e.status='processing' and e.locked_at<now()-interval '20 minutes'))
    order by e.due_at,e.created_at for update skip locked limit greatest(1,least(coalesce(p_limit,25),100))
   ) update public.campaign_end_events_v4 e set status='processing',attempt_count=e.attempt_count+1,locked_at=now(),last_attempt_at=now(),last_error=''
     from due where e.id=due.id returning e.*;
  end $body$;
  $definition$;
  revoke all on function public.claim_campaign_end_events_v4(integer,integer) from public,anon,authenticated;
  grant execute on function public.claim_campaign_end_events_v4(integer,integer) to service_role;
 end if;
end $install_claim$;

-- Profiles may retain presentation fields but cannot assign their own security context.
create or replace function public.protect_profile_security_fields() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.role()='service_role' or public.is_platform_admin() then return new; end if;
 if tg_op='INSERT' then
  new.role:='user';new.allowed_stores:='{}';new.default_organization_id:=null;
 else
  new.id:=old.id;new.role:=old.role;new.allowed_stores:=old.allowed_stores;
  new.default_organization_id:=old.default_organization_id;new.created_at:=old.created_at;
 end if;
 return new;
end $$;
drop trigger if exists protect_profile_security_fields on public.profiles;
create trigger protect_profile_security_fields before insert or update on public.profiles for each row execute function public.protect_profile_security_fields();

-- Transactional audit: a failure writing the log rolls back the administrative mutation.
create or replace function public.platform_audit_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_value jsonb; after_value jsonb; org uuid; key_value text;
begin
 if tg_op<>'INSERT' then before_value:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then after_value:=to_jsonb(new); end if;
 if before_value is not distinct from after_value then return coalesce(new,old); end if;
 org:=nullif(coalesce(after_value->>'organization_id',before_value->>'organization_id'),'')::uuid;
 if tg_table_name='organizations' then org:=coalesce(after_value->>'id',before_value->>'id')::uuid; end if;
 key_value:=coalesce(after_value->>'id',after_value->>'user_id',after_value->>'module_key',before_value->>'id',before_value->>'module_key');
 insert into public.audit_logs(organization_id,user_id,action,entity_type,before,after,metadata)
 values(org,auth.uid(),'platform.'||lower(tg_op),tg_table_name,before_value,after_value,jsonb_build_object('key',key_value,'source','phase-zero'));
 return coalesce(new,old);
end $$;

do $$
declare t text;
begin
 foreach t in array array['platform_admins','feature_modules','module_permissions','module_pages','organization_features','store_features','plan_features','organization_role_permissions','user_permissions','platform_settings','platform_migration_snapshots'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('drop policy if exists platform_read on public.%I',t);
  execute format('create policy platform_read on public.%I for select to authenticated using (public.is_platform_admin())',t);
 end loop;
 foreach t in array array['platform_admins','feature_modules','module_permissions','module_pages','organization_features','store_features','plan_features','organization_role_permissions','user_permissions','platform_settings','organizations','stores','organization_members','subscriptions'] loop
  execute format('drop trigger if exists platform_audit on public.%I',t);
  execute format('create trigger platform_audit after insert or update or delete on public.%I for each row execute function public.platform_audit_change()',t);
 end loop;
end $$;

-- Data access through PostgREST remains subject to both existing row scope and module permissions.
-- Business audit records are not part of the global administrator's data access.
-- CEO reads use platform_admin_read, which returns only platform administrative changes.
revoke all on public.audit_logs from public,anon,authenticated;
grant all on public.audit_logs to service_role;
do $$
declare t text; mod text; store_expr text; cmd text; action text;
begin
 for t,mod in select * from (values('articles','products'),('campaigns','campaigns'),('automatic_campaigns','automations'),('campaign_items','campaigns'),('templates','labels')) v(t,m) loop
  if to_regclass('public.'||t) is null then continue; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='organization_id') then raise exception 'Missing organization_id on %',t; end if;
  store_expr:='null::text';
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='store_id') then store_expr:='store_id::text'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='store') then store_expr:='store'; end if;
  foreach cmd in array array['select','insert','update','delete'] loop
   action:=case when cmd='select' then 'read' else 'write' end;
   execute format('drop policy if exists phase_zero_%s on public.%I',cmd,t);
   if cmd='insert' then
    execute format('create policy phase_zero_insert on public.%I as restrictive for insert to authenticated with check (public.platform_row_access(organization_id,%s,%L))',t,store_expr,mod||'.'||action);
   elsif cmd='update' then
    execute format('create policy phase_zero_update on public.%I as restrictive for update to authenticated using (public.platform_row_access(organization_id,%s,%L)) with check (public.platform_row_access(organization_id,%s,%L))',t,store_expr,mod||'.'||action,store_expr,mod||'.'||action);
   else
    execute format('create policy phase_zero_%s on public.%I as restrictive for %s to authenticated using (public.platform_row_access(organization_id,%s,%L))',cmd,t,cmd,store_expr,mod||'.'||action);
   end if;
  end loop;
 end loop;
end $$;

drop function if exists public.platform_access_context(uuid,uuid);
create or replace function public.platform_access_context(p_organization_id uuid default null,p_store_id uuid default null,p_include_permissions boolean default true) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare org uuid; sid uuid; member public.organization_members%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 org:=public.platform_resolve_org(p_organization_id);
 select * into member from public.organization_members where user_id=auth.uid() and organization_id=org and status='active';
 sid:=coalesce(p_store_id,member.store_id,(select c.store_id from public.platform_user_contexts c where c.user_id=auth.uid() and c.organization_id=org));
 if sid is null then
  select s.id into sid from public.stores s join public.profiles p on p.id=auth.uid()
   where s.organization_id=org and s.status='active' and lower(trim(s.name))=lower(trim(p.store)) order by s.id limit 1;
 end if;
 if sid is not null and (not exists(select 1 from public.stores where id=sid and organization_id=org and status='active') or (member.store_id is not null and sid<>member.store_id)) then
  if p_store_id is not null then raise exception 'Forbidden store' using errcode='42501'; end if;
  sid:=null; -- A revoked store must not lock a global administrator out of CEO management.
 end if;
 return jsonb_build_object('platform',(select to_jsonb(settings) from public.platform_settings settings),'platformAdmin',public.is_platform_admin(),'platformRole',(select role from public.platform_admins where user_id=auth.uid() and status='active'),'organizationId',org,'storeId',sid,'role',member.role,
 'organizations',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'status',o.status)),'[]') from public.organizations o join public.organization_members m on m.organization_id=o.id where m.user_id=auth.uid() and m.status='active'),
 'stores',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'status',s.status)),'[]') from public.stores s where s.organization_id=org and (member.store_id is null or s.id=member.store_id)),
 'permissions',case when p_include_permissions then (select coalesce(jsonb_object_agg(p.permission_key,public.platform_permission(org,p.permission_key,sid)),'{}') from public.module_permissions p) else '{}'::jsonb end,
 'pages',case when p_include_permissions then (select coalesce(jsonb_agg(to_jsonb(p) order by p.nav_order),'[]') from public.module_pages p where p.visible and public.platform_permission(org,p.permission_key,sid)) else '[]'::jsonb end);
end $$;

create or replace function public.bootstrap_platform_admin(p_email text) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(20261015);
 if exists(select 1 from public.platform_admins where status='active') then raise exception 'Initial CEO already assigned'; end if;
 select id into strict uid from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null and (banned_until is null or banned_until<now());
 insert into public.platform_admins(user_id,role,status) values(uid,'ceo','active');
 return uid;
end $$;
revoke all on function public.bootstrap_platform_admin(text) from public,anon,authenticated;
grant execute on function public.bootstrap_platform_admin(text) to service_role;

create or replace function public.platform_admin_mutate(p_entity text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare org uuid; sid uuid; uid uuid; rid uuid; result jsonb; k text; mod text; action text; dep text; old_provider text;
begin
 if not public.is_platform_admin() then raise exception 'Platform administrator required' using errcode='42501'; end if;
 if coalesce(jsonb_typeof(p_data),'')<>'object' or length(p_data::text)>32768 then raise exception 'Invalid payload' using errcode='22023'; end if;
 org:=nullif(p_data->>'organization_id','')::uuid; sid:=nullif(p_data->>'store_id','')::uuid;
 if org is not null and not exists(select 1 from public.organizations where id=org) then raise exception 'Organization not found' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtext(coalesce(org::text,p_entity)));
 -- Recheck after serializing concurrent changes to global administrators.
 if not public.is_platform_admin() then raise exception 'Platform administrator required' using errcode='42501'; end if;
 case p_entity
 when 'organization' then
  if length(trim(coalesce(p_data->>'name','')))<2 or length(p_data->>'name')>160 then raise exception 'Invalid name' using errcode='22023'; end if;
  if org is null then
   if coalesce(p_data->>'slug','') !~ '^[a-z0-9][a-z0-9-]{1,79}$' then raise exception 'Invalid slug' using errcode='22023'; end if;
   insert into public.organizations(name,slug,status) values(trim(p_data->>'name'),p_data->>'slug','active') returning id into org;
   insert into public.organization_role_permissions(organization_id,role,permission_key,allowed)
   select org,r.role,p.permission_key,case when m.category='core' then p.action='read' or (p.action='write' and r.role in ('owner','admin','manager','store_user')) or r.role in ('owner','admin') else r.role in ('owner','admin') end
   from public.module_permissions p join public.feature_modules m using(module_key) cross join (values('owner'),('admin'),('manager'),('store_user'),('viewer'),('support')) r(role);
  else
   update public.organizations set name=trim(p_data->>'name'),status=coalesce(p_data->>'status',status),
    settings=case when p_data?'settings' then p_data->'settings' else settings end,updated_at=now() where id=org;
  end if;
  select to_jsonb(o) into result from public.organizations o where id=org;
 when 'store' then
  if nullif(trim(p_data->>'email'),'') is not null and p_data->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid store email' using errcode='22023'; end if;
  if org is null or length(trim(coalesce(p_data->>'name','')))<1 or length(p_data->>'name')>120 then raise exception 'Invalid store' using errcode='22023'; end if;
  if sid is null then
   if length(trim(coalesce(p_data->>'code','')))<1 then raise exception 'Store code required' using errcode='22023'; end if;
   if exists(select 1 from public.stores where organization_id=org and
    (lower(trim(name)) in (lower(trim(p_data->>'name')),lower(trim(p_data->>'code')))
    or lower(trim(code)) in (lower(trim(p_data->>'name')),lower(trim(p_data->>'code'))))) then raise exception 'Ambiguous store name or code' using errcode='23505'; end if;
   insert into public.stores(organization_id,name,code,status,email) values(org,trim(p_data->>'name'),trim(p_data->>'code'),'active',nullif(trim(p_data->>'email'),'')) returning id into sid;
  else
   if exists(select 1 from public.stores where id=sid and organization_id=org and name<>trim(p_data->>'name')) then raise exception 'Store renaming requires migration of legacy campaign references' using errcode='22023'; end if;
   update public.stores set name=trim(p_data->>'name'),email=case when p_data?'email' then nullif(trim(p_data->>'email'),'') else email end,settings=coalesce(p_data->'settings',settings),status=coalesce(p_data->>'status',status),updated_at=now() where id=sid and organization_id=org;
   if not found then raise exception 'Invalid store scope' using errcode='42501'; end if;
  end if;
  select to_jsonb(s) into result from public.stores s where id=sid;
 when 'membership' then
  if org is null then raise exception 'Organization required' using errcode='22023'; end if;
  uid:=nullif(p_data->>'user_id','')::uuid;
  if uid is null then select id into uid from auth.users where lower(email)=lower(trim(p_data->>'email')); end if;
  if uid is null or not exists(select 1 from auth.users where id=uid) then raise exception 'Existing user required' using errcode='22023'; end if;
  if sid is not null and not exists(select 1 from public.stores where id=sid and organization_id=org) then raise exception 'Invalid store scope' using errcode='42501'; end if;
  insert into public.organization_members(organization_id,user_id,store_id,role,status) values(org,uid,sid,p_data->>'role',coalesce(p_data->>'status','active'))
  on conflict(organization_id,user_id) do update set store_id=excluded.store_id,role=excluded.role,status=excluded.status,updated_at=now();
  select to_jsonb(m) into result from public.organization_members m where organization_id=org and user_id=uid;
 when 'organization_feature' then
  mod:=p_data->>'module_key';
  if p_data->>'mode'='inherit' then delete from public.organization_features where organization_id=org and module_key=mod;
  else
   insert into public.organization_features(organization_id,module_key,enabled,source) values(org,mod,(p_data->>'enabled')::boolean,'ceo')
   on conflict(organization_id,module_key) do update set enabled=excluded.enabled,source='ceo',updated_at=now();
   if (p_data->>'enabled')::boolean and not public.platform_org_module(org,mod) then raise exception 'Activate module dependencies and organization first' using errcode='22023'; end if;
  end if;
  result:=jsonb_build_object('organization_id',org,'module_key',mod,'enabled',public.platform_org_module(org,mod));
 when 'store_feature' then
  mod:=p_data->>'module_key';
  if p_data->>'mode'='inherit' then delete from public.store_features where organization_id=org and store_id=sid and module_key=mod;
  else
   if (p_data->>'enabled')::boolean and not public.platform_org_module(org,mod) then raise exception 'Organization module disabled' using errcode='22023'; end if;
   insert into public.store_features(organization_id,store_id,module_key,enabled) values(org,sid,mod,(p_data->>'enabled')::boolean)
   on conflict(store_id,module_key) do update set enabled=excluded.enabled;
  end if;
  result:=jsonb_build_object('store_id',sid,'module_key',mod);
 when 'role_permission' then
  insert into public.organization_role_permissions(organization_id,role,permission_key,allowed) values(org,p_data->>'role',p_data->>'permission_key',(p_data->>'allowed')::boolean)
  on conflict(organization_id,role,permission_key) do update set allowed=excluded.allowed;
  result:=p_data;
 when 'user_permission' then
  uid:=(p_data->>'user_id')::uuid;k:=p_data->>'permission_key';
  if p_data->>'mode'='inherit' then delete from public.user_permissions where organization_id=org and user_id=uid and store_id is not distinct from sid and permission_key=k;
  else
   insert into public.user_permissions(organization_id,user_id,store_id,permission_key,allowed) values(org,uid,sid,k,(p_data->>'allowed')::boolean)
   on conflict(organization_id,user_id,store_id,permission_key) do update set allowed=excluded.allowed;
  end if;
  result:=p_data;
 when 'plan_feature' then
  insert into public.plan_features(plan_id,module_key,enabled) values(p_data->>'plan_id',p_data->>'module_key',(p_data->>'enabled')::boolean)
  on conflict(plan_id,module_key) do update set enabled=excluded.enabled;
  result:=p_data;
 when 'subscription' then
  select provider into old_provider from public.subscriptions where organization_id=org for update;
  if old_provider is not null and old_provider<>'manual' then raise exception 'Paid subscription changes require the billing provider' using errcode='22023'; end if;
  insert into public.subscriptions(organization_id,plan_id,status,provider) values(org,p_data->>'plan_id','manual','manual')
  on conflict(organization_id) do update set plan_id=excluded.plan_id,updated_at=now();
  select to_jsonb(s) into result from public.subscriptions s where organization_id=org;
 when 'module' then
  if p_data?'implemented' then raise exception 'Implementation state is managed by migrations' using errcode='22023'; end if;
  mod:=p_data->>'module_key';
  if length(trim(coalesce(p_data->>'name','')))<2 then raise exception 'Module name required' using errcode='22023'; end if;
  if exists(select 1 from public.feature_modules where module_key=mod) then
   update public.feature_modules set name=trim(p_data->>'name'),description=coalesce(p_data->>'description',description),status=coalesce(p_data->>'status',status) where module_key=mod;
  else
   insert into public.feature_modules(module_key,name,description,category,implemented,status) values(mod,trim(p_data->>'name'),coalesce(p_data->>'description',''),'custom',false,coalesce(p_data->>'status','available'));
   insert into public.module_permissions(permission_key,module_key,action) select mod||'.'||a,mod,a from unnest(array['read','write','manage']) a;
  end if;
  if p_data?'dependencies' then
   if jsonb_typeof(p_data->'dependencies')<>'array' then raise exception 'Invalid dependencies' using errcode='22023'; end if;
   for dep in select jsonb_array_elements_text(p_data->'dependencies') loop
    if dep=mod or not exists(select 1 from public.feature_modules where module_key=dep) then raise exception 'Invalid dependency' using errcode='22023'; end if;
   end loop;
   update public.feature_modules set dependencies=array(select jsonb_array_elements_text(p_data->'dependencies')) where module_key=mod;
   if exists(with recursive dependencies(k,path,cycle) as (
    select mod,array[mod],false union all
    select d,dependencies.path||d,d=any(dependencies.path) from dependencies
     join public.feature_modules f on f.module_key=dependencies.k cross join unnest(f.dependencies) d where not dependencies.cycle
   ) select 1 from dependencies where cycle) then raise exception 'Cyclic module dependency' using errcode='22023'; end if;
  end if;
  select to_jsonb(m) into result from public.feature_modules m where module_key=mod;
 when 'page' then
  -- Runtime only exposes routes implemented by the application; arbitrary script/URL input is rejected.
  update public.module_pages set name=coalesce(nullif(trim(p_data->>'name'),''),name),visible=(p_data->>'visible')::boolean where page_key=p_data->>'page_key';
  if not found then raise exception 'Unknown page' using errcode='22023'; end if;
  result:=p_data;
 when 'settings' then
  if coalesce(p_data->>'support_email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid support email' using errcode='22023'; end if;
  update public.platform_settings set display_name=left(p_data->>'display_name',80),support_email=left(p_data->>'support_email',254) where id;
  select to_jsonb(s) into result from public.platform_settings s;
 when 'platform_admin' then
  if not exists(select 1 from public.platform_admins where user_id=auth.uid() and role='ceo' and status='active') then raise exception 'CEO required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(20261015);
  uid:=(p_data->>'user_id')::uuid;
  if not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null and (banned_until is null or banned_until<now())) then raise exception 'Verified user required' using errcode='22023'; end if;
  if uid=auth.uid() then raise exception 'Self administrative changes prohibited' using errcode='42501'; end if;
  insert into public.platform_admins(user_id,role,status) values(uid,p_data->>'role',p_data->>'status')
  on conflict(user_id) do update set role=excluded.role,status=excluded.status;
  result:=jsonb_build_object('user_id',uid);
 else raise exception 'Unsupported administrative action' using errcode='22023';
 end case;
 return result;
end $$;

drop function if exists public.platform_admin_read(text,uuid,text,integer,integer);
create or replace function public.platform_admin_read(p_resource text,p_organization_id uuid default null,p_query text default '',p_limit integer default 50,p_offset integer default 0,p_status text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; org uuid:=p_organization_id; lim integer:=least(greatest(p_limit,1),100); off integer:=greatest(p_offset,0); total bigint; tab text;
begin
 if not public.is_platform_admin() then raise exception 'Platform administrator required' using errcode='42501'; end if;
 case p_resource
 when 'dashboard' then
  return jsonb_build_object('organizations',(select count(*) from public.organizations),'stores',(select count(*) from public.stores),
   'users',(select count(*) from auth.users),
   'active',(select count(*) from public.organizations where status in ('active','trialing')),
   'suspended',(select count(*) from public.organizations where status='suspended'),
   'pos',(select count(*) from public.organizations where public.platform_org_module(id,'pos')),
   'plans',(select coalesce(jsonb_agg(x),'[]') from (select p.id,p.name,count(s.id) subscriptions from public.plans p left join public.subscriptions s on s.plan_id=p.id group by p.id,p.name) x),
   'modules',(select coalesce(jsonb_agg(x),'[]') from (select m.module_key,m.name,count(o.id) filter(where public.platform_org_module(o.id,m.module_key)) organizations_enabled from public.feature_modules m cross join public.organizations o group by m.module_key,m.name order by organizations_enabled desc) x));
 when 'organizations' then
  select count(*) into total from public.organizations where name ilike '%'||left(p_query,160)||'%' and (p_status is null or status=p_status);
  select coalesce(jsonb_agg(x),'[]') into result from (
   select o.*,s.plan_id,s.status subscription_status,p.name plan_name,
    (select count(*) from public.stores where organization_id=o.id) stores_count,
    (select count(*) from public.organization_members where organization_id=o.id) users_count,
    (select coalesce(jsonb_agg(m.module_key),'[]') from public.feature_modules m where public.platform_org_module(o.id,m.module_key)) active_modules
   from public.organizations o left join public.subscriptions s on s.organization_id=o.id left join public.plans p on p.id=s.plan_id
   where o.name ilike '%'||left(p_query,160)||'%' and (p_status is null or o.status=p_status) order by o.name,o.id limit lim offset off) x;
 when 'organization' then
  if org is null then raise exception 'Organization required' using errcode='22023'; end if;
  return jsonb_build_object('organization',(select to_jsonb(o) from public.organizations o where id=org),
   'subscription',(select to_jsonb(s) from public.subscriptions s where organization_id=org),
   'modules',(select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('effective',public.platform_org_module(org,m.module_key),'override',f.enabled,'source',coalesce(f.source,case when pf.enabled then 'plan' else 'none' end)) order by m.module_key),'[]') from public.feature_modules m left join public.organization_features f on f.module_key=m.module_key and f.organization_id=org left join public.subscriptions s on s.organization_id=org left join public.plan_features pf on pf.plan_id=s.plan_id and pf.module_key=m.module_key));
 when 'stores' then
  select count(*) into total from public.stores where (org is null or organization_id=org) and name ilike '%'||left(p_query,160)||'%';
  select coalesce(jsonb_agg(x),'[]') into result from (select s.*,o.name organization_name from public.stores s join public.organizations o on o.id=s.organization_id where (org is null or s.organization_id=org) and s.name ilike '%'||left(p_query,160)||'%' order by s.name,s.id limit lim offset off) x;
 when 'users' then
  select count(*) into total from auth.users u left join public.organization_members m on m.user_id=u.id where (org is null or m.organization_id=org) and coalesce(u.email,'') ilike '%'||left(p_query,160)||'%';
  select coalesce(jsonb_agg(x),'[]') into result from (select m.id,m.organization_id,u.id user_id,m.store_id,m.role,coalesce(m.status,'unassigned') status,u.email,p.first_name,p.last_name,s.name store_name,o.name organization_name from auth.users u left join public.organization_members m on m.user_id=u.id left join public.profiles p on p.id=m.user_id left join public.stores s on s.id=m.store_id left join public.organizations o on o.id=m.organization_id where (org is null or m.organization_id=org) and coalesce(u.email,'') ilike '%'||left(p_query,160)||'%' order by u.email,m.id limit lim offset off) x;
 when 'audit' then
  select count(*) into total from public.audit_logs where metadata->>'source'='phase-zero' and action like 'platform.%' and (org is null or organization_id=org);
  select coalesce(jsonb_agg(x),'[]') into result from (select id,user_id,organization_id,action,entity_type,before,after,metadata,created_at from public.audit_logs where metadata->>'source'='phase-zero' and action like 'platform.%' and (org is null or organization_id=org) order by created_at desc,id desc limit lim offset off) x;
 when 'catalog' then
  return jsonb_build_object('modules',(select coalesce(jsonb_agg(to_jsonb(m) order by module_key),'[]') from public.feature_modules m),
   'permissions',(select coalesce(jsonb_agg(to_jsonb(p) order by permission_key),'[]') from public.module_permissions p),
   'pages',(select coalesce(jsonb_agg(to_jsonb(p) order by nav_order),'[]') from public.module_pages p),
   'plans',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.plans p),
   'plan_features',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.plan_features p));
 when 'permissions' then
  if org is null then raise exception 'Organization required' using errcode='22023'; end if;
  return jsonb_build_object('roles',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.organization_role_permissions r where organization_id=org),
   'users',(select coalesce(jsonb_agg(to_jsonb(u)),'[]') from public.user_permissions u where organization_id=org),
   'stores',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.store_features s where organization_id=org));
 when 'settings' then
  return jsonb_build_object('settings',(select to_jsonb(s) from public.platform_settings s),
   'admins',(select coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'role',a.role,'status',a.status,'email',u.email)),'[]') from public.platform_admins a join auth.users u on u.id=a.user_id),
   'snapshot',(select jsonb_build_object('captured_at',captured_at,'expert_id',expert_id) from public.platform_migration_snapshots where migration_key='phase-zero-20261015'));
 else raise exception 'Unknown resource' using errcode='22023';
 end case;
 return jsonb_build_object('items',result,'total',total,'limit',lim,'offset',off);
end $$;

create or replace function public.platform_select_context(p_organization_id uuid,p_store_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ctx jsonb;
begin
 ctx:=public.platform_access_context(p_organization_id,p_store_id);
 if p_organization_id is null or ctx->>'organizationId' is null then raise exception 'Organization required' using errcode='22023'; end if;
 insert into public.platform_user_contexts(user_id,organization_id,store_id) values(auth.uid(),p_organization_id,nullif(ctx->>'storeId','')::uuid)
 on conflict(user_id) do update set organization_id=excluded.organization_id,store_id=excluded.store_id;
 return ctx;
end $$;

create or replace function public.platform_member_email(p_org uuid,p_email text) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare uid uuid;
begin
 if not public.platform_permission(p_org,'stores.manage') then raise exception 'Forbidden' using errcode='42501'; end if;
 select u.id into uid from auth.users u join public.organization_members m on m.user_id=u.id where m.organization_id=p_org and lower(u.email)=lower(trim(p_email));
 return uid;
end $$;


-- Legacy RPC overloads bypass tenant/module checks. The client uses the scoped signatures.
do $$
declare signature text; t text; cmd text;
begin
 foreach signature in array array['public.get_article_for_label(text)','public.search_articles_for_labels(text,integer,integer)','public.get_campaign_end_archive(uuid)','public.get_campaign_end_archive(text)'] loop
  if to_regprocedure(signature) is not null then execute 'revoke execute on function '||signature||' from public,anon,authenticated'; end if;
 end loop;
 -- These writes go through the checked server or transactional CEO RPC.
 foreach t in array array['organizations','organization_members','stores','subscriptions','plans','audit_logs'] loop
  execute format('revoke insert,update,delete,truncate,references,trigger on public.%I from public,anon,authenticated',t);
 end loop;
end $$;

-- Private PDFs must resolve to an authorised campaign, not just a guessable path prefix.
create or replace function public.platform_pdf_access(p_name text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare allowed boolean;
begin
 if to_regclass('public.automatic_campaigns') is null then return false; end if;
 execute 'select exists(select 1 from public.automatic_campaigns c where
  (c.pdf_url=$1 or exists(select 1 from jsonb_each_text(case when jsonb_typeof(c.pdfs)=''object'' then c.pdfs else ''{}''::jsonb end) v where v.value=$1))
  and public.platform_row_access(c.organization_id,c.store,''automations.read''))' into allowed using p_name;
 return coalesce(allowed,false);
end $$;
do $$
begin
 if to_regclass('storage.objects') is not null then
  drop policy if exists phase_zero_pdf_read on storage.objects;
  create policy phase_zero_pdf_read on storage.objects as restrictive for select to authenticated
   using (bucket_id<>'automatic-campaign-pdfs' or public.platform_pdf_access(name));
  drop policy if exists phase_zero_pdf_write on storage.objects;
  create policy phase_zero_pdf_write on storage.objects as restrictive for insert to authenticated
   with check (bucket_id<>'automatic-campaign-pdfs');
  drop policy if exists phase_zero_pdf_update on storage.objects;
  create policy phase_zero_pdf_update on storage.objects as restrictive for update to authenticated
   using (bucket_id<>'automatic-campaign-pdfs') with check (bucket_id<>'automatic-campaign-pdfs');
  drop policy if exists phase_zero_pdf_delete on storage.objects;
  create policy phase_zero_pdf_delete on storage.objects as restrictive for delete to authenticated using (bucket_id<>'automatic-campaign-pdfs');
 end if;
end $$;


-- System-only recipient resolver uses the same action checks as interactive users.
create or replace function public.platform_notification_recipients(p_org uuid,p_store text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sid uuid; n integer;
begin
 select count(*),(array_agg(s.id))[1] into n,sid from public.stores s where s.organization_id=p_org
  and (lower(trim(s.name))=lower(trim(p_store)) or lower(trim(s.code))=lower(trim(p_store)));
 if n<>1 or not public.platform_store_module(p_org,sid,'automations') then return '[]'::jsonb; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('userId',u.id,'email',lower(u.email),'firstName',p.first_name,'lastName',p.last_name,'role',m.role,'store',p_store)),'[]'::jsonb)
  from public.organization_members m join auth.users u on u.id=m.user_id left join public.profiles p on p.id=u.id
  where m.organization_id=p_org and m.status='active' and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<now())
   and (m.store_id=sid or (m.store_id is null and lower(trim(p.store))=lower(trim(p_store))))
   and public.platform_user_permission(u.id,p_org,'reports.read',sid)
   and public.platform_user_permission(u.id,p_org,'automations.read',sid));
end $$;

-- Close PUBLIC function execution defaults; user-aware checks are the sole authorization source.
do $$
declare r record;
begin
 for r in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'platform_%' or p.proname in ('is_platform_admin','is_app_admin','resolve_article_rpc_organization')) loop
  execute format('revoke all on function %s from public,anon,authenticated',r.signature);
  execute format('grant execute on function %s to service_role',r.signature);
  if r.proname in ('platform_pdf_access','platform_select_context','platform_member_email','platform_permission','platform_row_access','platform_access_context','platform_admin_read','platform_admin_mutate','is_platform_admin','is_app_admin','resolve_article_rpc_organization') then
   execute format('grant execute on function %s to authenticated',r.signature);
  end if;
 end loop;
end $$;
select pg_notify('pgrst','reload schema');
commit;
