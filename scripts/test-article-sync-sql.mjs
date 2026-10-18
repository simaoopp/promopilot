import { PGlite } from '../qa/phase-zero/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();let passed=0;
const sql=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const org='20000000-0000-4000-8000-000000000001', other='20000000-0000-4000-8000-000000000002';
const actor='10000000-0000-4000-8000-000000000003', beta='10000000-0000-4000-8000-000000000004';
const sync='40000000-0000-4000-8000-000000000001';
async function as(id=actor){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[id]);await db.exec('set role authenticated');}
async function owner(q,args=[]){await db.exec('reset role');return db.query(q,args);}
const batch=(index,rows,received=rows.length,o=org)=>db.query('select platform_article_sync_batch($1,$2,$3,$4,$5) result',[o,sync,index,JSON.stringify(rows),received]).then(r=>r.rows[0].result);
async function check(name,fn){await fn();console.log(`PASS atomic ${++passed}: ${name}`);}
try{
 await db.exec(await sql('supabase/tests/phase_zero.fixture.sql'));
 await db.exec(await sql('supabase/migrations/20261015_platform_permissions.sql'));
 await db.exec(`alter table articles add pvp1 text not null default '100,00',add pvp2 numeric default 80,add pvp3 text not null default '120,00',add estado text not null default 'A',add codigo_barras text not null default '',add search_terms text not null default '';`);
 await db.exec(await sql('supabase/migrations/20260827_article_database_sync.sql'));
 await db.exec(await sql('supabase/migrations/20260906_article_database_sync_300k.sql'));
 const migration=await sql('supabase/migrations/20261018191000_article_sync_atomic.sql');await db.exec(migration);await db.exec(migration);
 await db.query('insert into article_sync_logs(id,organization_id,user_id,total_rows) values($1,$2,$3,20)',[sync,org,actor]);
 await as();
 await check('scoped batch updates prices, inserts new articles and preserves omitted fields',async()=>{
  const r=await batch(0,[{artigo:'article-expert',pvp2:70,organization_id:other,descricao:'must not replace'},{artigo:'new-article',pvp2:0,descricao:'New synthetic'}],3);
  assert.equal(r.updated,1);assert.equal(r.inserted,1);assert.equal(r.duplicateRowsInBatch,1);assert.equal(r.totals.processed_rows,3);
  const article=(await owner("select * from articles where artigo='article-expert'")).rows[0];
  assert.equal(article.organization_id,org);assert.equal(article.descricao,'Expert product');assert.equal(article.pvp1,'100,00');assert.equal(Number(article.pvp2),70);await as();
 });
 await check('retry is idempotent and cannot overwrite committed values',async()=>{
  const r=await batch(0,[{artigo:'article-expert',pvp2:999}]);assert.equal(r.duplicate,true);assert.equal(r.totals.processed_rows,3);
 });
 await check('out-of-order requests fail before writes',async()=>{await assert.rejects(batch(2,[{artigo:'article-expert',pvp2:900}]),e=>e.code==='40001');});
 await check('another tenant or another actor cannot use this sync ID',async()=>{
  await assert.rejects(batch(1,[{artigo:'article-expert',pvp2:900}],1,other),e=>e.code==='42501');
  await as(beta);await assert.rejects(batch(1,[{artigo:'article-expert',pvp2:900}]),e=>e.code==='42501');await as();
 });
 await check('failure after first article rolls back every price and progress counter',async()=>{
  await assert.rejects(batch(1,[{artigo:'article-expert',pvp2:99},{artigo:'article-beta',pvp2:1}]),e=>e.code==='23505');
  assert.equal(Number((await owner("select pvp2 from articles where artigo='article-expert'")).rows[0].pvp2),70);
  const log=(await owner('select * from article_sync_logs where id=$1',[sync])).rows[0];assert.equal(log.last_batch_index,0);assert.equal(log.processed_rows,3);await as();
 });
 await check('retry after rollback succeeds with accurate unchanged counters',async()=>{
  const r=await batch(1,[{artigo:'article-expert',pvp2:70}]);assert.equal(r.unchanged,1);assert.equal(r.updated,0);assert.equal(r.totals.processed_rows,4);
 });
 await check('duplicate concurrent submissions apply the batch once',async()=>{
  const results=await Promise.all([batch(2,[{artigo:'article-expert',pvp2:60}]),batch(2,[{artigo:'article-expert',pvp2:60}])]);
  assert.equal(results.filter(r=>r.duplicate).length,1);assert.equal(results[1].totals.processed_rows,5);
 });
 await check('invalid size, numeric values and duplicate codes do not write',async()=>{
  for(const rows of [[],Array.from({length:301},(_,i)=>({artigo:'qa'+i,pvp2:1})),[{artigo:'article-expert',pvp2:'NaN'}],[{artigo:'article-expert',pvp2:1},{artigo:'article-expert',pvp2:2}]])await assert.rejects(batch(3,rows),e=>e.code==='22023');
 });
 await check('direct RPC rechecks revoked access',async()=>{
  await owner("update organization_members set status='disabled' where user_id=$1",[actor]);await as();await assert.rejects(batch(3,[{artigo:'article-expert',pvp2:1}]),e=>e.code==='42501');
 });
 console.log(`${passed} atomic SQL scenarios passed (PGlite; queued connections, not a remote concurrency load test).`);
}finally{await db.close();}
