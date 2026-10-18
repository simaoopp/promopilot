import { PGlite } from '../qa/phase-zero/node_modules/@electric-sql/pglite/dist/index.js';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { runFoundationTests } from './test-phase-zero-foundation.mjs';
const db = new PGlite();
const fixture = await fs.readFile('supabase/tests/phase_zero.fixture.sql', 'utf8');
const migration = await fs.readFile('supabase/migrations/20261015_platform_permissions.sql', 'utf8');
const ceo='10000000-0000-4000-8000-000000000001', user='10000000-0000-4000-8000-000000000002', admin='10000000-0000-4000-8000-000000000003';
const org='20000000-0000-4000-8000-000000000001', other='20000000-0000-4000-8000-000000000002', store='30000000-0000-4000-8000-000000000001', second='30000000-0000-4000-8000-000000000002', foreignStore='30000000-0000-4000-8000-000000000003';
let passed=0;
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${passed}: ${name}`); }
async function identity(id, role='authenticated') { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id,role]); await db.exec('set role '+role); }
async function value(sql,args=[]) { return Object.values((await db.query(sql,args)).rows[0])[0]; }
const mutate=(entity,data)=>value('select public.platform_admin_mutate($1,$2)',[entity,JSON.stringify(data)]);
const permission=(key,sid=store)=>value('select public.platform_permission($1,$2,$3)',[org,key,sid]);
const toggle=(module,enabled)=>mutate('organization_feature',{organization_id:org,module_key:module,enabled});
try {
 await db.exec(fixture);
 await check('migration applies transactionally and may run twice',async()=>{await db.exec(migration);await db.exec(migration);});
 await check('no CEO automatically promoted, including existing organization admin',async()=>{
  assert.equal(await value('select count(*)::int from platform_admins'),0);await identity(admin);assert.equal(await value('select is_platform_admin()'),false);
  await assert.rejects(()=>value("select public.platform_admin_read('dashboard')"));
  await assert.rejects(()=>db.exec(`update organization_members set role='owner' where user_id='${admin}'`));
 });
 await check('first CEO bootstrap is service-only and one-time',async()=>{
  await assert.rejects(()=>value('select public.bootstrap_platform_admin($1)',['admin@example.test']));
  await identity('','service_role');assert.equal(await value('select public.bootstrap_platform_admin($1)',['ceo@example.test']),ceo);
  await assert.rejects(()=>value('select public.bootstrap_platform_admin($1)',['admin@example.test']));
 });
 await check('Expert organization, stores, memberships, profiles and subscription snapshot preserved',async()=>{
  await db.exec('reset role');
  const snap=await value("select snapshot from platform_migration_snapshots where migration_key='phase-zero-20261015'");
  for(const [key,table] of Object.entries({organizations:'organizations',stores:'stores',memberships:'organization_members',profiles:'profiles',plans:'plans',subscriptions:'subscriptions'})) {
   const now=(await db.query(`select * from ${table}`)).rows;
   assert.equal(now.length,snap[key].length,key);
   // JSON round-trip makes timestamps identical to jsonb serialization.
   const canonical=await value(`select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from ${table} t`);
   assert.deepEqual(canonical,[...snap[key]].sort((a,b)=>a.id.localeCompare(b.id)),key);
  }
 });
 await check('all five existing menu pages preserved for Expert collaborator; POS initially absent',async()=>{
  await identity(user);const ctx=await value('select platform_access_context()');
  assert.deepEqual(ctx.pages.filter(p=>p.show_in_navigation).map(p=>p.page_key),['home','manual','catalog','excel','dossiers']);
  for(const key of ['dashboard','products','campaigns','labels','dossiers','automations','stores','reports','ai']) assert.equal(ctx.permissions[`${key}.read`],true,key);
  assert.equal(ctx.permissions['pos.read'],false);
 });
 await check('RLS isolates same-named stores in two organizations',async()=>{
  assert.deepEqual((await db.query('select id from campaigns')).rows,[{id:'expert-campaign'}]);
  assert.deepEqual((await db.query('select artigo from articles')).rows,[{artigo:'article-expert'}]);
  await assert.rejects(()=>db.query('insert into campaigns values($1,$2,$3,$4)',['bad',other,'Praia','bad']));
 });
 await check('legacy RPC revoked and scoped lookup prevents cross-tenant access',async()=>{
  assert.equal(await value("select has_function_privilege('authenticated','public.get_article_for_label(text)','execute')"),false);
  assert.equal((await db.query('select * from get_article_for_label($1,$2)',['article-expert',org])).rows.length,1);
  await assert.rejects(()=>db.query('select * from get_article_for_label($1,$2)',['article-beta',other]));
 });
 await check('organization/store spoofing denied, including store of another tenant',async()=>{
  await assert.rejects(()=>value('select platform_access_context($1)',[other]));
  await assert.rejects(()=>value('select platform_access_context($1,$2)',[org,second]));
  assert.equal(await permission('campaigns.read',foreignStore),false);
 });
 await check('profile cannot assign administrative role, default organization or allowed stores',async()=>{
  await db.query("update profiles set role='admin',default_organization_id=$1,allowed_stores=array['Centro'] where id=$2",[other,user]);
  const profile=(await db.query('select * from profiles')).rows[0];assert.equal(profile.role,'user');assert.equal(profile.default_organization_id,org);assert.deepEqual(profile.allowed_stores,[]);
  assert.equal(await value('select is_platform_admin()'),false);
  await assert.rejects(()=>mutate('organization_feature',{organization_id:org,module_key:'pos',enabled:true}));
  await assert.rejects(()=>db.query('insert into platform_admins(user_id) values($1)',[user]));
  await assert.rejects(()=>value('select platform_user_permission($1,$2,$3,$4)',[ceo,org,'pos.read',store]));
 });
 await check('private PDFs respect organization and module permissions',async()=>{
  assert.deepEqual((await db.query('select name from storage.objects')).rows,[{name:'private/expert.pdf'}]);
  await identity(ceo);await toggle('automations',false);await identity(user);
  assert.equal((await db.query('select name from storage.objects')).rows.length,0);
  await identity(ceo);await toggle('automations',true);
 });
 await check('CEO lists real organizations and stores; regular admin cannot read global data',async()=>{
  const list=await value("select platform_admin_read('organizations')");assert.equal(list.total,2);
  assert.equal((await value("select platform_admin_read('stores',$1)",[org])).total,2);
  await identity(admin);await assert.rejects(()=>value("select platform_admin_read('organizations')"));await identity(ceo);
 });
 await check('future module stays inaccessible until its implementation is installed',async()=>{
  await identity(ceo);await toggle('pos',true);await identity(user);
  assert.equal(await permission('pos.read'),false);
  assert.ok(!(await value('select platform_access_context()')).pages.some(p=>p.page_key==='pos'));
  assert.equal(await permission('products.manage'),true,'reviewed legacy import right preserved');
  await identity(ceo);await assert.rejects(()=>mutate('module',{module_key:'pos',name:'POS',implemented:true}));
  await db.exec('reset role');await db.exec("update feature_modules set implemented=true where module_key='pos'");await identity(ceo);
 });
 await check('enable POS persists, but collaborator needs an explicit action grant',async()=>{
  await toggle('pos',true);await identity(user);assert.equal(await permission('pos.read'),false);
  await identity(ceo);await mutate('user_permission',{organization_id:org,user_id:user,permission_key:'pos.read',allowed:true});
  await identity(user);assert.equal(await permission('pos.read'),true);assert.ok((await value('select platform_access_context()')).pages.some(p=>p.page_key==='pos'));
 });
 await check('store-specific block wins over user grant',async()=>{
  await identity(ceo);await mutate('store_feature',{organization_id:org,store_id:store,module_key:'pos',enabled:false});
  await identity(user);assert.equal(await permission('pos.read'),false);
  await identity(ceo);await mutate('store_feature',{organization_id:org,store_id:store,module_key:'pos',mode:'inherit'});
 });
 await check('user deny wins over role and allow in a different scope',async()=>{
  await identity(ceo);await mutate('user_permission',{organization_id:org,user_id:user,store_id:store,permission_key:'pos.read',allowed:false});
  await identity(user);assert.equal(await permission('pos.read'),false);
  await identity(ceo);await mutate('user_permission',{organization_id:org,user_id:user,store_id:store,permission_key:'pos.read',mode:'inherit'});
 });
 await check('disabling organization module immediately blocks APIs/RLS without deleting campaigns',async()=>{
  await identity(ceo);await toggle('campaigns',false);await toggle('pos',false);await identity(user);
  assert.equal(await permission('pos.read'),false);assert.equal((await db.query('select * from campaigns')).rows.length,0);
  await identity(ceo);await toggle('campaigns',true);await identity(user);assert.equal((await db.query('select * from campaigns')).rows.length,1);
 });
 await check('module dependencies are enforced and cycles rejected',async()=>{
  await identity(ceo);await assert.rejects(()=>toggle('sales',true));
  await assert.rejects(()=>mutate('module',{module_key:'products',name:'Produtos',dependencies:['campaigns']}));
  await toggle('products',false);await identity(user);assert.equal(await permission('labels.read'),false);assert.equal(await permission('campaigns.write'),false);
  await identity(ceo);await toggle('products',true);
 });
 await check('multi-store organization admin switches stores; disabled stores block operations',async()=>{
  await identity(admin);const ctx=await value('select platform_select_context($1,$2)',[org,second]);assert.equal(ctx.storeId,second);
  await identity(ceo);await mutate('store',{organization_id:org,store_id:second,name:'Centro',status:'disabled'});
  await identity(admin);assert.equal(await permission('products.read',second),false);
  await identity(ceo);await mutate('store',{organization_id:org,store_id:second,name:'Centro',status:'active'});
 });
 await check('worker does not claim disabled events or consume retry attempts',async()=>{
  await identity(ceo);await toggle('automations',false);await identity('','service_role');
  assert.equal((await db.query('select * from claim_campaign_end_events_v4()')).rows.length,0);
  await db.exec('reset role');assert.equal(await value('select attempt_count from campaign_end_events_v4'),0);
  await identity(ceo);await toggle('automations',true);await identity('','service_role');
  const events=(await db.query('select * from claim_campaign_end_events_v4()')).rows;assert.equal(events.length,1);assert.equal(events[0].attempt_count,1);
 });
 await check('worker recipient list applies membership and per-user permissions',async()=>{
  await identity('','service_role');assert.ok((await value('select platform_notification_recipients($1,$2)',[org,'Praia'])).some(r=>r.userId===user));
  await identity(ceo);await mutate('user_permission',{organization_id:org,user_id:user,permission_key:'reports.read',allowed:false});
  await identity('','service_role');assert.ok(!(await value('select platform_notification_recipients($1,$2)',[org,'Praia'])).some(r=>r.userId===user));
  await identity(ceo);await mutate('user_permission',{organization_id:org,user_id:user,permission_key:'reports.read',mode:'inherit'});
 });
 await check('suspended organization and disabled membership remove access',async()=>{
  await identity(ceo);await mutate('organization',{organization_id:org,name:'Expert',status:'suspended'});await identity(user);assert.equal(await permission('campaigns.read'),false);
  await identity(ceo);await mutate('organization',{organization_id:org,name:'Expert',status:'active'});
  await mutate('membership',{organization_id:org,user_id:user,store_id:store,role:'store_user',status:'disabled'});await identity(user);assert.equal(await permission('products.read'),false);
  await identity(ceo);await mutate('membership',{organization_id:org,user_id:user,store_id:store,role:'store_user',status:'active'});
 });
 await check('new organizations have no implicit modules; plans and CEO overrides remain independent',async()=>{
  await db.exec('reset role');await db.exec("insert into plans(id,name) values('qa-plan','QA plan')");await identity(ceo);
  const created=await mutate('organization',{name:'New QA tenant',slug:'qa-tenant'});
  await identity('','service_role');assert.equal(await value('select platform_org_module($1,$2)',[created.id,'pos']),false);await identity(ceo);
  await mutate('plan_feature',{plan_id:'qa-plan',module_key:'pos',enabled:true});await mutate('subscription',{organization_id:created.id,plan_id:'qa-plan'});
  assert.equal((await value("select platform_admin_read('organization',$1)",[created.id])).modules.find(m=>m.module_key==='pos').source,'plan');
  await mutate('organization_feature',{organization_id:created.id,module_key:'pos',enabled:false});
  assert.equal((await value("select platform_admin_read('organization',$1)",[created.id])).modules.find(m=>m.module_key==='pos').effective,false);
 });
 await check('paid subscriptions cannot be modified by the administrative billing action',async()=>{
  await db.exec('reset role');await db.query("insert into subscriptions(organization_id,plan_id,status,provider) values($1,'qa-plan','active','stripe')",[other]);await identity(ceo);
  await assert.rejects(()=>mutate('subscription',{organization_id:other,plan_id:'qa-plan'}));
 });
 await check('page registry controls navigation and direct-page availability',async()=>{
  await identity(ceo);await mutate('page',{page_key:'manual',visible:false});await identity(user);
  assert.ok(!(await value('select platform_access_context()')).pages.some(p=>p.page_key==='manual'));
  await identity(ceo);await mutate('page',{page_key:'manual',visible:true});
 });
 await check('administrative writes roll back if audit persistence fails',async()=>{
  await db.exec('reset role');await db.exec("create function fail_qa_audit() returns trigger language plpgsql as $$begin raise exception 'audit unavailable';end$$; create trigger qa_fail before insert on audit_logs for each row execute function fail_qa_audit()");
  await identity(ceo);await assert.rejects(()=>mutate('organization',{organization_id:org,name:'Should roll back',status:'active'}));
  assert.equal((await value("select platform_admin_read('organization',$1)",[org])).organization.name,'Expert');
  await db.exec('reset role');await db.exec('drop trigger qa_fail on audit_logs');await identity(ceo);
 });
 await check('migration re-run preserves CEO decisions and inherited-plan overrides',async()=>{
  await mutate('organization_feature',{organization_id:org,module_key:'pos',mode:'inherit'});
  await db.exec('reset role');await db.exec(migration);
  assert.equal(await value("select count(*)::int from organization_features where organization_id=$1 and module_key='pos'",[org]),0);
  await identity(ceo);assert.ok((await value("select platform_admin_read('audit')")).total>15);
 });
 await check('global audit excludes commercial records and cannot be read directly',async()=>{
  await db.exec('reset role');await db.exec("insert into audit_logs(action,entity_type,metadata) values('business.sale','orders','{\"source\":\"pos\"}')");
  await identity(ceo);const audit=await value("select platform_admin_read('audit')");
  assert.ok(audit.items.every(x=>x.action.startsWith('platform.')));
  await assert.rejects(()=>db.query('select * from audit_logs'));
 });
 await check('unreviewed legacy exceptions stop the initial migration',async()=>{
  const isolated=new PGlite();try {await isolated.exec(fixture);await isolated.exec("set promopilot.legacy_admin_user_ids = ''");
   await assert.rejects(()=>isolated.exec(migration));await isolated.exec('rollback');
   assert.equal((await isolated.query("select to_regclass('public.platform_admins') t")).rows[0].t,null);
  }finally{await isolated.close();}
 });
 await check('preflight rejects unresolved ownership without leaving a partial migration',async()=>{
  const isolated=new PGlite();
  try {await isolated.exec(fixture);await isolated.exec("update campaigns set organization_id=null where id='expert-campaign'");
   await assert.rejects(()=>isolated.exec(migration));await isolated.exec('rollback');
   assert.equal((await isolated.query("select to_regclass('public.platform_admins') t")).rows[0].t,null);
  } finally {await isolated.close();}
 });
 await check('preflight refuses ambiguous Expert identification',async()=>{
  const isolated=new PGlite();
  try {await isolated.exec(fixture);await isolated.exec("insert into organizations(name,slug) values('Expert','ambiguous')");
   await assert.rejects(()=>isolated.exec(migration));await isolated.exec('rollback');
   assert.equal((await isolated.query("select to_regclass('public.platform_migration_snapshots') t")).rows[0].t,null);
  } finally {await isolated.close();}
 });
 passed += await runFoundationTests();
 console.log(`SQL: ${passed} security/regression scenarios passed (PostgreSQL via PGlite; synthetic data).`);
} finally { await db.close(); }
