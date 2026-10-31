import { PGlite } from '../qa/phase-zero/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const db = new PGlite();
const org='20000000-0000-4000-8000-000000000001', other='20000000-0000-4000-8000-000000000002';
const actor='10000000-0000-4000-8000-000000000002', beta='10000000-0000-4000-8000-000000000004';
let passed=0;
const sql=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
async function owner(query,args=[]) { await db.exec('reset role'); return db.query(query,args); }
async function as(id=actor) { await owner("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[id]); await db.exec('set role authenticated'); }
const rpc=(action,payload={},tenant=org,store='Praia')=>db.query('select campaign_price_import($1,$2,$3,$4) result',[tenant,store,action,JSON.stringify(payload)]).then(r=>r.rows[0].result);
const source={name:'synthetic.csv',sha256:'a'.repeat(64),sheet:'Prices',mapping:{headerRow:0,codeColumn:0,priceColumn:2}};
const rows=[{line:2,code:'0010025',rawCode:'0010025',rawPrice:'299,99',cents:29999},
 {line:3,code:'equal',rawPrice:'199,99',cents:19999},{line:4,code:'increase',rawPrice:'169,99',cents:16999},
 {line:5,code:'unknown',rawPrice:'9',cents:900},{line:6,code:'bad',rawPrice:'1,000',cents:null}];
const prepare=(overrides={})=>rpc('prepare',{id:randomUUID(),mode:'manual',source,rows,...overrides});
const confirm=(batch,selected)=>rpc('confirm',{id:batch.id,selected:selected||batch.rows.filter(r=>!r.problem&&r.currentCents).map(r=>({id:r.id,cents:r.currentCents,reviewed:true}))});
const save=(id,items,tenant=org,store='Praia')=>db.query('insert into campaigns(id,organization_id,store,title,dados) values($1,$2,$3,$4,$5) returning dados',[id,tenant,store,'Synthetic',JSON.stringify(items)]);
async function check(name,fn) { await fn(); console.log(`PASS import SQL ${++passed}: ${name}`); }
try {
 await db.exec(await sql('supabase/tests/phase_zero.fixture.sql'));
 await db.exec(await sql('supabase/migrations/20261015_platform_permissions.sql'));
 await db.exec(`alter table articles drop constraint articles_pkey;
 alter table articles add id uuid primary key default gen_random_uuid(),add pvp1 numeric default 500,add pvp2 numeric default 349.99,
 add pvp3 numeric default 600,add estado text default 'A',add codigo_barras text default '0123456789012',add marca text default 'Catalog brand',add stock integer default 7;
 create index articles_import_fixture_key on articles(organization_id,artigo);
 alter table campaigns add dados jsonb not null default '[]';
 insert into articles(organization_id,artigo,descricao,pvp2) values
 ('${org}','0010025','Original catalogue description',349.99),('${other}','0010025','Other tenant',849.99),
 ('${org}','equal','Same',199.99),('${org}','increase','Higher',149.99),('${org}','bad','Needs review',99.99),
 ('${org}','ambiguous','A',1),('${org}','ambiguous','B',2),('${org}','invalidcatalog','Invalid',0);
 update campaigns set dados='[{"codigo":"old","antes":40,"atual":30,"pv3":60}]';`);
 const articleSnapshot=(await db.query('select jsonb_agg(to_jsonb(a) order by id) data from articles a')).rows[0].data;
 const campaignSnapshot=(await db.query('select jsonb_agg(to_jsonb(c) order by id) data from campaigns c')).rows[0].data;
 const migration=await sql('supabase/migrations/20261031120000_campaign_price_import.sql');
 await db.exec(migration);await db.exec(migration);
 await db.exec(`create function reject_catalog_writes() returns trigger language plpgsql as $$begin raise exception 'Campaign import must never write articles'; end$$;
 create trigger reject_catalog_writes before insert or update or delete on articles for each statement execute function reject_catalog_writes();`);
 await as();
 let batch,confirmed;
 await check('PVP2 Before comes from scoped catalogue, never imported PVP1/PVP3',async()=>{
  batch=await prepare();const row=batch.rows[0];assert.equal(row.beforeCents,34999);assert.equal(row.currentCents,29999);assert.equal(row.description,'Original catalogue description');
  assert.equal(batch.rows[3].problem,'not_found');assert.equal(batch.rows[4].currentCents,null);
 });
 await check('later administrative price changes do not replace a prepared snapshot',async()=>{
  await owner('alter table articles disable trigger reject_catalog_writes');
  await owner("update articles set pvp2=399.99 where organization_id=$1 and artigo='0010025'",[org]);
  await owner('alter table articles enable trigger reject_catalog_writes');await as();
  assert.equal((await rpc('get',{id:batch.id})).rows[0].beforeCents,34999);
  const newer=await prepare({rows:[rows[0]]});assert.equal(newer.rows[0].beforeCents,39999);
  await owner('alter table articles disable trigger reject_catalog_writes');
  await owner("update articles set pvp2=349.99 where organization_id=$1 and artigo='0010025'",[org]);
  await owner('alter table articles enable trigger reject_catalog_writes');await as();
 });
 await check('same article code in two tenants resolves independently',async()=>{
  await as(beta);const b=await rpc('prepare',{id:randomUUID(),mode:'excel',source,rows:[rows[0]]},other);
  assert.equal(b.rows[0].beforeCents,84999);await assert.rejects(()=>rpc('get',{id:batch.id}),e=>e.code==='42501');await as();
 });
 await check('wrong store, missing actor and revoked permissions fail closed',async()=>{
  await assert.rejects(()=>rpc('get',{id:batch.id},org,'Centro'),e=>e.code==='42501');
  await as('');await assert.rejects(()=>rpc('get',{id:batch.id}),e=>e.code==='42501');await as();
  await owner("update organization_members set status='disabled' where user_id=$1",[actor]);await as();
  await assert.rejects(()=>rpc('get',{id:batch.id}),e=>e.code==='42501');
  await owner("update organization_members set status='active' where user_id=$1",[actor]);await as();
 });
 await check('duplicate, missing, ambiguous codes and invalid catalog prices stay pending',async()=>{
  const b=await prepare({rows:[...rows.slice(0,1),{...rows[0],line:3},
   {line:4,code:'ambiguous',cents:100},{line:5,code:'invalidcatalog',cents:100},{line:6,code:'',cents:100}]});
  assert.deepEqual(b.rows.map(r=>r.problem),['duplicate','duplicate','ambiguous','invalid_catalog_price','missing_code']);
  await assert.rejects(()=>confirm(b,b.rows.map(r=>({id:r.id,cents:100}))),e=>e.code==='22023');
 });
 await check('unconfirmed drafts cannot be attached to a campaign',async()=>{
  await assert.rejects(()=>save('unconfirmed',[{codigo:rows[0].code,antes:349.99,atual:299.99,campaignPriceImport:{kind:'catalog-pvp2-v1',rowId:batch.rows[0].id}}]),e=>e.code==='22023');
 });
 await check('explicit confirmation accepts decreases, equals, increases and corrected price only',async()=>{
  const selected=batch.rows.filter(r=>!r.problem).map(r=>({id:r.id,cents:r.currentCents||8999,reviewed:true}));
  confirmed=await confirm(batch,selected);
  assert.deepEqual(confirmed.items.map(i=>i.campaignPriceImport.state),['Promoção','Sem alteração','Aumento','Promoção']);
  assert.equal(confirmed.items[3].antes,99.99);assert.equal(confirmed.items[3].atual,89.99);
  assert.equal(confirmed.items[0].pv3,null);
  assert.deepEqual((await confirm(batch,selected)).items,confirmed.items);
  await assert.rejects(()=>confirm(batch,[{id:batch.rows[0].id,cents:1}]),e=>e.code==='40001');
 });
 await check('campaign persistence records both prices, identities and provenance',async()=>{
  const data=(await save('import-manual',confirmed.items)).rows[0].dados;
  assert.equal(data[0].antes,349.99);assert.equal(data[0].atual,299.99);
  assert.equal(data[0].article_id,articleSnapshot.find(a=>a.artigo==='0010025'&&a.organization_id===org).id);
  const audit=(await db.query("select * from campaign_price_import_applications where campaign_id='import-manual'")).rows;
  assert.equal(audit.length,4);assert.equal(audit[0].organization_id,org);
 });
 await check('forged previous/current prices or a foreign organization never enter campaigns',async()=>{
  for(const patch of [{antes:1},{atual:1},{codigo:'foreign'}]) {
   await assert.rejects(()=>save('forged',[{...confirmed.items[0],...patch}]),e=>e.code==='22023');
  }
  await assert.rejects(()=>save('cross-tenant',confirmed.items,other),e=>e.code==='42501');
  await assert.rejects(()=>db.query("update campaigns set dados=$1 where id='import-manual'",[JSON.stringify([{codigo:rows[0].code,antes:1,atual:1}])]),e=>e.code==='22023');
 });
 await check('a second campaign and new imports cannot rewrite previous campaign prices',async()=>{
  const b=await prepare({mode:'excel',rows:[{...rows[0],cents:24999}]});const c=await confirm(b);await save('import-excel',c.items);
  const data=(await db.query("select dados from campaigns where id='import-manual'")).rows[0].dados;
  assert.equal(data[0].atual,299.99);assert.equal(c.items[0].atual,249.99);
 });
 await check('models persist beyond 100, paginate, reload, edit and delete within the tenant',async()=>{
  const mapping={version:1,headerRow:0,codeColumn:0,priceColumn:2,headers:['Code','Cost','Promotion']};
  for(let i=0;i<101;i++) await rpc('save_model',{name:`Supplier ${String(i).padStart(3,'0')}`,mapping});
  const first=await rpc('models'),second=await rpc('models',{offset:100});
  assert.equal(first.models.length,100);assert.equal(second.models.length,1);assert.deepEqual(second.models[0].mapping,mapping);
  const id=first.models[0].id;await rpc('save_model',{id,name:'Corrected',mapping:{...mapping,priceColumn:1}});
  assert.equal((await rpc('models',{search:'Corrected'})).models[0].mapping.priceColumn,1);
  await as(beta);assert.equal((await rpc('models',{},other)).models.length,0);
  await assert.rejects(()=>rpc('save_model',{id,name:'Hijack',mapping},other),e=>e.code==='42501');
  await as();await rpc('delete_model',{id});assert.equal((await rpc('models',{search:'Corrected'})).models.length,0);
 });
 await check('drafts, catalogue snapshots and audit records cannot be updated directly',async()=>{
  for(const table of ['campaign_price_imports','campaign_price_import_rows','campaign_price_import_models','campaign_price_import_applications'])
   await assert.rejects(()=>db.query(`delete from ${table}`),e=>e.code==='42501');
  await assert.rejects(()=>db.query('select campaign_price_import_result($1)',[batch.id]),e=>e.code==='42501');
  await as(beta);assert.equal((await db.query('select * from campaign_price_import_rows where import_id=$1',[batch.id])).rows.length,0);await as();
 });
 await check('prepare retries preserve snapshot and reject a changed payload with the same id',async()=>{
  const payload={id:randomUUID(),mode:'manual',source,rows:[rows[0]]};const b=await rpc('prepare',payload);
  assert.deepEqual(await rpc('prepare',payload),b);
  await assert.rejects(()=>rpc('prepare',{...payload,rows:[{...rows[0],cents:1}]}),e=>e.code==='40001');
 });
 await check('a bad selected row rolls back the entire confirmation; retry can select valid rows',async()=>{
  const b=await prepare({rows:[rows[0],rows[3]]});
  await assert.rejects(()=>confirm(b,b.rows.map(r=>({id:r.id,cents:100}))),e=>e.code==='22023');
  const draft=await rpc('get',{id:b.id});assert.equal(draft.status,'prepared');assert.deepEqual(draft.items,[]);
  assert.equal((await confirm(b,[{id:b.rows[0].id,cents:29999}])).items.length,1);
 });
 await check('catalogue and existing campaigns remain byte-for-byte identical',async()=>{
  const after=(await owner('select jsonb_agg(to_jsonb(a) order by id) data from articles a')).rows[0].data;
  assert.deepEqual(after,articleSnapshot);
  const old=(await owner("select jsonb_agg(to_jsonb(c) order by id) data from campaigns c where id in ('expert-campaign','beta-campaign')")).rows[0].data;
  assert.deepEqual(old,campaignSnapshot);
 });
 await check('operational rollback blocks new imports while preserving audit and existing snapshots',async()=>{
  await owner('select 1');await db.exec(await sql('supabase/rollback/20261031120000_campaign_price_import_disable.sql'));await as();
  await assert.rejects(()=>prepare(),e=>e.code==='42501');
  assert.equal((await db.query("select dados from campaigns where id='import-manual'")).rows[0].dados[0].antes,349.99);
  assert.equal((await db.query('select * from campaign_price_import_applications')).rows.length,5);
  await owner('select 1');await db.exec(migration);await as();assert.equal((await rpc('get',{id:batch.id})).status,'confirmed');
 });
 console.log(`${passed} campaign price import SQL scenarios passed. Local PostgreSQL/PGlite; no production connection.`);
} finally { await db.close(); }
