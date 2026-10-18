import { PGlite } from '../qa/phase-zero/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const sql = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const org = '20000000-0000-4000-8000-000000000001';
const other = '20000000-0000-4000-8000-000000000002';
const user = '10000000-0000-4000-8000-000000000002';
const admin = '10000000-0000-4000-8000-000000000003';
const beta = '10000000-0000-4000-8000-000000000004';
const ceo = '10000000-0000-4000-8000-000000000001';
const store = '30000000-0000-4000-8000-000000000001';
const second = '30000000-0000-4000-8000-000000000002';
const foreign = '30000000-0000-4000-8000-000000000003';
const db = new PGlite();
let passed = 0;
const value = async (query, args = []) => Object.values((await db.query(query, args)).rows[0])[0];
async function as(id = '', role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [id, role]);
  await db.exec(`set role ${role}`);
}
async function check(name, fn) { try { await fn(); console.log(`PASS audit ${++passed}: ${name}`); } catch (error) { console.error('FAIL audit:', name, error); throw error; } }
async function owner(query, args = []) { await db.exec('reset role'); return db.query(query, args); }
const search = (organizationId = org, q = 'article') => db.query('select * from public.search_articles_for_labels($1,30,0,$2)', [q, organizationId]);
const invite = (s, role = 'store_user', o = org) => value('select platform_can_invite_member($1,$2,$3)', [o, s, role]);
const member = email => value('select platform_member_email($1,$2)', [org, email]);
function definition(source, name) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing source definition: ${name}`);
  const end = source.indexOf('$$;', start);
  assert.ok(end > start);
  return source.slice(start, end + 3);
}
try {
  const [fixture, platform, migration, legacy, workingNumeric] = await Promise.all([
    sql('supabase/tests/phase_zero.fixture.sql'),
    sql('supabase/migrations/20261015_platform_permissions.sql'),
    sql('supabase/migrations/20261018190000_platform_audit_hardening.sql'),
    sql('supabase/migrations/20260622_articles_direct_search_no_index_v1.sql'),
    sql('supabase/migrations/20260525_instant_article_search_index.sql'),
  ]);
  await db.exec(fixture);
  await db.exec(platform);
  await db.exec(`alter table public.articles
    add column pvp1 text default '100,00', add column pvp2 text default '80,00', add column pvp3 text default '',
    add column codigo_barras text default '', add column titulo_oficial text default '', add column descricao_oficial text default '',
    add column marca text default '', add column modelo text default '', add column brand text default '',
    add column categoria text default '', add column subcategory text default '', add column search_terms text default ''`);
  // Install the actual historical function bodies, without replaying their
  // unrelated data backfill or indexes. All tenants/products remain fictitious.
  await db.exec(definition(legacy, 'article_search_normalize'));
  await db.exec(definition(legacy, 'safe_pt_numeric'));
  await check('reproduces undefined variable in historical price conversion', async () => {
    await assert.rejects(() => value("select safe_pt_numeric('80,00')"), /value/);
  });
  await db.exec(definition(workingNumeric, 'safe_pt_numeric'));
  await db.exec(definition(legacy, 'search_articles_for_labels'));
  await as(user);
  await check('reproduces legacy cross-tenant RPC despite restrictive table RLS', async () => {
    assert.equal((await search(other)).rows[0].artigo, 'article-beta');
    assert.equal((await db.query('select artigo from articles where organization_id=$1', [other])).rows.length, 0);
  });
  await as(beta);
  await check('reproduces first-tenant fallback for a different organization', async () => {
    assert.equal((await search(null)).rows[0].artigo, 'article-expert');
  });
  await db.exec('reset role');
  await db.exec('revoke select on public.articles from authenticated; grant select on public.articles to public; create policy legacy_public_article_read on public.articles for select to public using(true)');
  await check('reproduces anonymous access through inherited PUBLIC privileges in a legacy configuration', async () => {
    await as('', 'anon');
    assert.equal((await db.query('select artigo from articles')).rows.length, 2);
    await db.exec('reset role');
  });
  const tables = ['articles', 'organizations', 'stores', 'organization_members', 'profiles', 'organization_features', 'user_permissions'];
  const snapshot = async () => Promise.all(tables.map(table => value(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${table} t`)));
  const before = await snapshot();
  await check('incremental migration applies twice without modifying business/access data', async () => {
    await db.exec(migration); await db.exec(migration);
    assert.deepEqual(await snapshot(), before);
  });
  await as(user);
  await check('own legacy search preserves contract and foreign organization is refused', async () => {
    const own = (await search()).rows;
    assert.equal(own[0].artigo, 'article-expert'); assert.equal(Number(own[0].pvp2), 80);
    await assert.rejects(() => search(other), e => e.code === '42501');
  });
  await as(beta);
  await check('default organization resolves to the authenticated member, never the first tenant', async () => {
    assert.equal((await search(null)).rows[0].artigo, 'article-beta');
  });
  await as('', 'anon');
  await check('anonymous RPC and private implementation are inaccessible', async () => {
    await assert.rejects(() => search());
    await assert.rejects(() => db.query('select * from promopilot_private.search_articles_for_labels($1,30,0,$2)', ['article', org]));
  });
  await as(user);
  await check('authenticated users cannot bypass the public wrapper', async () => {
    await assert.rejects(() => db.query('select * from promopilot_private.search_articles_for_labels($1,30,0,$2)', ['article', other]));
    assert.equal(await value("select has_function_privilege('authenticated',p.oid,'execute') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='promopilot_private' and p.proname='search_articles_for_labels'"), false);
    await assert.rejects(() => search(org, 'a'.repeat(161)), e => e.code === '22023');
  });
  await check('module suspension and disabled membership block legacy RPC too', async () => {
    await owner("update organization_features set enabled=false where organization_id=$1 and module_key='products'", [org]); await as(user);
    await assert.rejects(() => search(), e => e.code === '42501');
    await owner("update organization_features set enabled=true where organization_id=$1 and module_key='products'", [org]);
    await owner("update organization_members set status='disabled' where organization_id=$1 and user_id=$2", [org, user]); await as(user);
    await assert.rejects(() => search(), e => e.code === '42501');
    await owner("update organization_members set status='active' where organization_id=$1 and user_id=$2", [org, user]);
  });
  await check('banned account cannot search with an otherwise valid subject', async () => {
    await owner("update auth.users set banned_until=now()+interval '1 day' where id=$1", [user]); await as(user);
    await assert.rejects(() => search(), e => e.code === '42501');
    await owner('update auth.users set banned_until=null where id=$1', [user]);
  });
  await as('', 'service_role');
  await check('system search preserves explicit organization support', async () => {
    assert.equal((await search(other)).rows[0].artigo, 'article-beta');
    await assert.rejects(() => search(null));
  });
  await check('global administration never implicitly grants tenant product access', async () => {
    await value("select bootstrap_platform_admin('ceo@example.test')"); await as(ceo);
    assert.equal(await value('select is_platform_admin()'), true);
    await assert.rejects(() => search(), e => e.code === '42501');
  });
  await as(user);
  await check('store collaborator can invite in their own store but not another store/tenant', async () => {
    assert.equal(await invite(store), true); assert.equal(await invite(second), false);
    assert.equal(await invite(foreign, 'store_user', other), false);
    assert.equal(await invite(store, 'admin'), false); assert.equal(await invite(store, 'owner'), false);
    assert.equal(await invite(null), false);
  });
  await as(admin);
  await check('organization administrator retains team management in their own stores', async () => {
    assert.equal(await invite(store, 'admin'), true); assert.equal(await invite(second, 'manager'), true);
    assert.equal(await invite(foreign, 'admin', other), false);
    assert.equal(await member('member@example.test'), user);
  });
  await check('store-bound administrator cannot grant organization-wide roles', async () => {
    await owner('update organization_members set store_id=$1 where user_id=$2', [store, admin]); await as(admin);
    assert.equal(await invite(store, 'store_user'), true); assert.equal(await invite(store, 'admin'), false);
    await owner('update organization_members set store_id=null where user_id=$1', [admin]);
  });
  await check('password reset resolution respects target store and elevated roles', async () => {
    await owner('update organization_members set store_id=$1 where user_id=$2', [second, admin]);
    await as(user); assert.equal(await member('admin@example.test'), null);
    assert.equal(await member('beta@example.test'), null);
    assert.equal(await member('missing@example.test'), null);
    await owner('update organization_members set store_id=null where user_id=$1', [admin]);
  });
  await check('legacy numeric conversion accepts Portuguese prices and safely handles invalid input', async () => {
    await db.exec('reset role');
    assert.equal(await value("select safe_pt_numeric('1 234,56')"), '1234.56');
    assert.equal(await value("select safe_pt_numeric('1.234,56')"), '1234.56');
    assert.equal(await value("select safe_pt_numeric('1234.56')"), '1234.56');
    assert.equal(await value("select safe_pt_numeric('invalid')"), null);
  });
  await check('existing navigation survives hardening and no POS tables are introduced', async () => {
    await as(user);
    const context = await value('select platform_access_context()');
    assert.deepEqual(context.pages.filter(p => p.show_in_navigation).map(p => p.page_key), ['home','manual','catalog','excel','dossiers']);
    assert.equal(context.permissions['products.manage'], true);
    assert.equal(context.permissions['stores.manage'], true);
    assert.equal(context.permissions['pos.read'], false);
    assert.equal(await value("select to_regclass('public.pos_orders')"), null);
  });
  await check('PUBLIC inheritance no longer grants anonymous table access; own authenticated reads remain available', async () => {
    await as('', 'anon');
    await assert.rejects(() => db.query('select artigo from public.articles'), error => error.code === '42501');
    await as(user);
    assert.deepEqual((await db.query('select artigo from public.articles')).rows.map(r => r.artigo), ['article-expert']);
  });
  console.log(`Audit SQL: ${passed} scenarios passed; isolated PostgreSQL, synthetic data only.`);
} finally { await db.close(); }
