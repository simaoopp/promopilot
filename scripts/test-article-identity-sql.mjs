// PostgreSQL integration scenarios on ephemeral PGlite fixture (never production).
// PGlite executes the index statements without CONCURRENTLY because its in-memory
// single-connection runner wraps SQL in transactions; production retains CONCURRENTLY.
import { PGlite } from '../qa/phase-zero/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const file = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const orgA = '20000000-0000-4000-8000-000000000001';
const orgB = '20000000-0000-4000-8000-000000000002';
const alice = '10000000-0000-4000-8000-000000000002';
const bob = '10000000-0000-4000-8000-000000000004';
const db = new PGlite();
const q = (query, values = []) => db.query(query, values);
const admin = async (query, values=[]) => { await db.exec('reset role'); return q(query, values); };
const scalar = async (sql, values=[]) => Object.values((await q(sql,values)).rows[0])[0];
async function as(user) {
  await db.exec('reset role');
  await q("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[user]);
  await db.exec('set role authenticated');
}
let passed = 0;
async function check(label, task) {
  await task();
  console.log(`PASS article-identity ${++passed}: ${label}`);
}
try {
  await db.exec(await file('supabase/tests/phase_zero.fixture.sql'));
  await db.exec(await file('supabase/migrations/20261015_platform_permissions.sql'));
  // Compact fixture has only essential fields; production has these already.
  await db.exec(`alter table public.articles
    add column updated_at timestamptz not null default now(),
    add column pvp1 text not null default '120',
    add column pvp2 numeric default 100,
    add column pvp3 text not null default '',
    add column estado text not null default '',
    add column codigo_barras text default '',
    add column search_terms text default '';
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
    create trigger trg_articles_updated_at before update on public.articles for each row execute function public.set_updated_at();`);
  const timestampBefore = await scalar("select updated_at from articles where artigo='article-expert'");
  const ownerBefore = await scalar("select organization_id from articles where artigo='article-expert'");
  await check('expand is repeatable and preserves the old global PK', async () => {
    const m = await file('supabase/migrations/20261019010000_articles_identity_expand.sql');
    await db.exec(m);
    await db.exec(m);
    assert.equal(await scalar("select pg_get_constraintdef(oid) from pg_constraint where conname='articles_pkey'"), 'PRIMARY KEY (artigo)');
    await assert.rejects(() => q('insert into articles(artigo,organization_id,descricao) values ($1,$2,$3)', ['article-expert',orgB,'not allowed yet']), e => e.code === '23505');
  });
  await check('backfill preserves ownership and update timestamps', async () => {
    const backfill = await file('supabase/diagnostics/articles_identity_backfill.sql');
    const result=await db.exec(backfill);
    assert.ok(result);
    assert.equal(Number(await scalar('select count(*) from articles where article_id is null')),0);
    assert.equal(new Date(await scalar("select updated_at from articles where artigo='article-expert'")).getTime(), new Date(timestampBefore).getTime());
    assert.equal(await scalar("select organization_id from articles where artigo='article-expert'"), ownerBefore);
  });
  await check('partial build is blocked if old article FK still references the global code', async () => {
    const sql=(await file('supabase/manual/20261019011000_articles_identity_indexes.sql')).replaceAll('CONCURRENTLY ', '');
    await db.exec(sql);
    await db.exec('create table legacy_article_reference(code text references public.articles(artigo));');
    const cutover = await file('supabase/manual/20261019012000_articles_identity_cutover.sql');
    await assert.rejects(() => db.exec(cutover), /Foreign keys reference old article primary key/);
    // The cutover begins a transaction; an expected SQL exception aborts it.
    await db.exec('ROLLBACK');
    await db.exec('drop table legacy_article_reference;');
  });
  await check('cutover is repeatable and switches to UUID PK + per-tenant code', async () => {
    const sql=await file('supabase/manual/20261019012000_articles_identity_cutover.sql');
    await db.exec(sql);
    await db.exec(sql);
    assert.equal(await scalar("select pg_get_constraintdef(oid) from pg_constraint where conname='articles_pkey'"),'PRIMARY KEY (article_id)');
    assert.equal(Number(await scalar("select count(*) from pg_constraint where conname='articles_organization_artigo_key'")),1);
    await admin('insert into articles(artigo,organization_id,descricao) values ($1,$2,$3)', ['article-expert',orgB,'other tenant, same code']);
    assert.equal(Number(await scalar("select count(*) from articles where artigo='article-expert'")),2);
    assert.equal(Number(await scalar('select count(distinct article_id) from articles')),3);
  });
  await check('RLS remains tenant-scoped, both organizations retain independent prices', async () => {
    await as(alice);
    assert.deepEqual((await q("select organization_id from articles where artigo='article-expert'")).rows.map(r=>r.organization_id),[orgA]);
    await as(bob);
    assert.deepEqual((await q("select organization_id from articles where artigo='article-expert'")).rows.map(r=>r.organization_id),[orgB]);
    await admin("update articles set pvp1='333' where organization_id=$1 and artigo='article-expert'",[orgB]);
    const amounts=(await q("select organization_id,pvp1 from articles where artigo='article-expert' order by organization_id")).rows;
    assert.equal(amounts[0].pvp1,'120'); assert.equal(amounts[1].pvp1,'333');
    await as(bob);
    await assert.rejects(() => q('update articles set organization_id=$1 where organization_id=$2 and artigo=$3',[orgA,orgB,'article-expert']), e => e.code === '23514' || e.code === '42501');
  });
  await check('atomic import can update its own duplicate code with no cross-org write', async () => {
    await db.exec('reset role');
    await db.exec(await file('supabase/migrations/20260827_article_database_sync.sql'));
    await db.exec(await file('supabase/migrations/20260906_article_database_sync_300k.sql'));
    await db.exec(await file('supabase/migrations/20261018191000_article_sync_atomic.sql'));
    const sync='40000000-0000-4000-8000-000000000004';
    // The fixture's store user has read-only products permission by default.
    // Grant the required import permission explicitly for this synthetic scenario.
    await admin("insert into public.user_permissions(organization_id,user_id,permission_key,allowed) values ($1,$2,'products.manage',true)",[orgB,bob]);
    await admin('insert into article_sync_logs(id,organization_id,user_id,total_rows) values($1,$2,$3,1)',[sync,orgB,bob]);
    await as(bob);
    const result=await scalar('select platform_article_sync_batch($1,$2,0,$3,1)',[orgB,sync,JSON.stringify([{artigo:'article-expert',pvp2:41}])]);
    assert.equal(result.updated,1);
    const amounts=(await admin("select organization_id,pvp2 from articles where artigo='article-expert' order by organization_id")).rows;
    assert.equal(Number(amounts[0].pvp2),100);
    assert.equal(Number(amounts[1].pvp2),41);
  });
  console.log(`${passed} article identity scenarios (in-memory PostgreSQL fixture; not a multi-connection load test).`);
} finally { await db.close(); }
