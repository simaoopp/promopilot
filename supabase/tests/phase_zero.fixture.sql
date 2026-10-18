-- Synthetic local test database only. Never apply to production.
set promopilot.legacy_admin_user_ids = '["10000000-0000-4000-8000-000000000002"]';
create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,banned_until timestamptz);
create table public.organizations(id uuid primary key default gen_random_uuid(),name text not null,slug text unique not null,status text not null default 'active' check(status in ('active','trialing','past_due','suspended','cancelled')),settings jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz default now());
create table public.stores(id uuid primary key default gen_random_uuid(),organization_id uuid references organizations(id),name text,code text,email text,settings jsonb default '{}',status text default 'active' check(status in ('active','disabled')),created_at timestamptz default now(),updated_at timestamptz default now(),unique(organization_id,code));
create table public.organization_members(id uuid primary key default gen_random_uuid(),organization_id uuid references organizations(id),user_id uuid references auth.users(id),role text check(role in ('owner','admin','manager','store_user','viewer','support')),store_id uuid references stores(id),status text default 'active' check(status in ('active','disabled','invited')),created_at timestamptz default now(),updated_at timestamptz default now(),unique(organization_id,user_id));
create table public.profiles(id uuid primary key references auth.users(id),first_name text,last_name text,role text default 'user',store text,allowed_stores text[] default '{}',default_organization_id uuid references organizations(id),created_at timestamptz default now());
create table public.plans(id text primary key,name text,features jsonb default '{}');
create table public.subscriptions(id uuid primary key default gen_random_uuid(),organization_id uuid unique references organizations(id),plan_id text references plans(id),status text default 'manual',provider text default 'manual',updated_at timestamptz default now());
create table public.audit_logs(id uuid primary key default gen_random_uuid(),organization_id uuid references organizations(id),user_id uuid references auth.users(id),action text,entity_type text,entity_id uuid,before jsonb,after jsonb,metadata jsonb,created_at timestamptz default now());
create table public.campaigns(id text primary key,organization_id uuid references organizations(id),store text,title text);
alter table public.campaigns enable row level security;
create policy old_campaigns on public.campaigns to authenticated using(true) with check(true);
grant select,insert,update,delete on public.campaigns to authenticated;
insert into auth.users values
('10000000-0000-4000-8000-000000000001','ceo@example.test',now(),null),
('10000000-0000-4000-8000-000000000002','member@example.test',now(),null),
('10000000-0000-4000-8000-000000000003','admin@example.test',now(),null),
('10000000-0000-4000-8000-000000000004','beta@example.test',now(),null);
insert into organizations(id,name,slug) values('20000000-0000-4000-8000-000000000001','Expert','expert'),('20000000-0000-4000-8000-000000000002','Beta','beta');
insert into stores(id,organization_id,name,code) values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Praia','praia'),('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Centro','centro'),('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','Praia','praia');
insert into organization_members(organization_id,user_id,role,store_id) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','store_user','30000000-0000-4000-8000-000000000001'),
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','admin',null),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','store_user','30000000-0000-4000-8000-000000000003');
insert into profiles(id,role,store,default_organization_id) select user_id,case when role='admin' then 'admin' else 'user' end,'Praia',organization_id from organization_members;
insert into campaigns values('expert-campaign','20000000-0000-4000-8000-000000000001','Praia','Expert'),('beta-campaign','20000000-0000-4000-8000-000000000002','Praia','Beta');
-- Deliberately permissive legacy policies prove that the restrictive layer is effective.
alter table profiles enable row level security;
create policy own_profile on profiles to authenticated using(id=auth.uid()) with check(id=auth.uid());
grant select,insert,update on profiles to authenticated;
grant select,insert,update,delete on organizations,organization_members,stores,audit_logs to authenticated;
create table articles(artigo text primary key,organization_id uuid references organizations(id),descricao text);
alter table articles enable row level security;
create policy legacy_article_access on articles to authenticated using(true) with check(true);
grant all on articles to authenticated;
insert into articles values('article-expert','20000000-0000-4000-8000-000000000001','Expert product'),('article-beta','20000000-0000-4000-8000-000000000002','Beta product');
create function get_article_for_label(p_code text) returns setof articles language sql security definer as $$select * from articles where artigo=p_code$$;
grant execute on function get_article_for_label(text) to public;
create function get_article_for_label(p_code text,p_organization_id uuid default null) returns setof articles language plpgsql security definer set search_path='' as $$begin return query select * from public.articles where artigo=p_code and organization_id=public.resolve_article_rpc_organization(p_organization_id);end$$;
grant execute on function get_article_for_label(text,uuid) to authenticated;
create table automatic_campaigns(id text primary key,organization_id uuid references organizations(id),store text,pdf_url text,pdfs jsonb);
alter table automatic_campaigns enable row level security;
create policy legacy_auto on automatic_campaigns to authenticated using(true) with check(true);
grant all on automatic_campaigns to authenticated;
insert into automatic_campaigns values('auto-expert','20000000-0000-4000-8000-000000000001','Praia','private/expert.pdf','{}'),('auto-beta','20000000-0000-4000-8000-000000000002','Praia','private/beta.pdf','{}');
create schema storage;
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create policy legacy_storage on storage.objects to authenticated using(true) with check(true);
grant usage on schema storage to authenticated;
grant all on storage.objects to authenticated;
insert into storage.objects(bucket_id,name) values('automatic-campaign-pdfs','private/expert.pdf'),('automatic-campaign-pdfs','private/beta.pdf');
create table campaign_end_events_v4(id uuid primary key default gen_random_uuid(),organization_id uuid references organizations(id),store text,due_at timestamptz,next_attempt_at timestamptz,attempt_count integer default 0,status text default 'pending',locked_at timestamptz,last_attempt_at timestamptz,last_error text default '',created_at timestamptz default now());
insert into campaign_end_events_v4(organization_id,store,due_at,next_attempt_at) values('20000000-0000-4000-8000-000000000001','Praia',now()-interval '1 day',now()-interval '1 day');
