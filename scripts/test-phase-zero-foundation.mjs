import { PGlite } from '../qa/phase-zero/node_modules/@electric-sql/pglite/dist/index.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const org = '20000000-0000-4000-8000-000000000001';
const user = '10000000-0000-4000-8000-000000000002';
const ceo = '10000000-0000-4000-8000-000000000001';
const store = '30000000-0000-4000-8000-000000000001';
const tables = ['organizations', 'stores', 'organization_members', 'profiles', 'campaigns', 'articles', 'automatic_campaigns', 'campaign_end_events_v4'];

export async function runFoundationTests() {
  const sql = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const [fixture, partial, migration, preflight, preservation, pos] = await Promise.all([
    sql('supabase/tests/phase_zero.fixture.sql'),
    sql('supabase/tests/phase_zero_partial.fixture.sql'),
    sql('supabase/migrations/20261015_platform_permissions.sql'),
    sql('supabase/tests/phase_zero_preflight.sql'),
    sql('supabase/tests/phase_zero_verify_preservation.sql'),
    sql('supabase/migrations/20261017_pos_operations.sql'),
  ]);
  let passed = 0;
  const val = async (db, query, params = []) => Object.values((await db.query(query, params)).rows[0])[0];
  const rows = (db, table) => val(db, `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${table} t`);
  async function check(name, setup, test) {
    const db = new PGlite();
    try {
      if (setup !== null) await db.exec(fixture + setup);
      await test(db);
      console.log(`PASS foundation ${++passed}: ${name}`);
    } finally { await db.close(); }
  }
  async function noFoundation(db) {
    for (const table of ['plans', 'subscriptions', 'audit_logs', 'platform_migration_snapshots']) {
      assert.equal(await val(db, 'select to_regclass($1)', [`public.${table}`]), null, table);
    }
  }
  async function rejected(db, message) {
    await assert.rejects(() => db.exec(migration), message);
    await db.exec('rollback');
  }
  async function as(db, id, role = 'authenticated') {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [id, role]);
    await db.exec(`set role ${role}`);
  }

  await check('inventory reports absent administrative tables without creating them', partial, async db => {
    const result = (await db.exec(preflight)).at(-1).rows[0].phase_zero_inventory;
    assert.deepEqual(result.administrative_tables_to_create, ['plans', 'subscriptions', 'audit_logs']);
    assert.deepEqual(result.missing_required_tables, []);
    assert.equal(result.plans, null);
    assert.equal(result.expert.length, 1);
    await noFoundation(db);
  });

  await check('partial tenant schema migrates twice with every existing row preserved', partial, async db => {
    const before = new Map();
    for (const table of tables) before.set(table, await rows(db, table));
    await db.exec(migration);
    await db.exec(migration);
    for (const table of tables) assert.deepEqual(await rows(db, table), before.get(table), table);
    for (const table of ['plans', 'subscriptions', 'audit_logs', 'platform_admins']) assert.deepEqual(await rows(db, table), [], table);
    const snapshot = await val(db, 'select snapshot from platform_migration_snapshots');
    assert.deepEqual(snapshot.foundation_tables_created, ['plans', 'subscriptions', 'audit_logs']);
    for (const check of (await db.exec(preservation))[0].rows) assert.equal(check.passed, true, check.check_name);
    const result = (await db.exec(preflight)).at(-1).rows[0].phase_zero_inventory;
    assert.deepEqual(result.administrative_tables_to_create, []);
  });

  await check('new tables are protected despite permissive Supabase default grants', partial, async db => {
    await db.exec('alter default privileges in schema public grant all on tables to anon,authenticated');
    await db.exec(migration);
    for (const table of ['plans', 'subscriptions', 'audit_logs']) {
      assert.equal(await val(db, 'select relrowsecurity from pg_class where oid=$1::regclass', [table]), true);
      for (const role of ['anon', 'authenticated']) {
        for (const privilege of ['select', 'insert', 'update', 'delete', 'truncate']) {
          assert.equal(await val(db, 'select has_table_privilege($1,$2,$3)', [role, table, privilege]), false, `${role} ${privilege} ${table}`);
        }
      }
      assert.equal(await val(db, "select has_table_privilege('service_role',$1,'select,insert')", [table]), true);
    }
  });

  await check('CEO actions use new keys and audit while preserving tenant isolation', partial, async db => {
    await db.exec(migration);
    await db.exec("insert into plans(id,name) values('test-quote','Orçamento de teste')");
    await as(db, '', 'service_role');
    await val(db, "select bootstrap_platform_admin('ceo@example.test')");
    await as(db, ceo);
    const change = (entity, data) => val(db, 'select platform_admin_mutate($1,$2)', [entity, JSON.stringify(data)]);
    await change('subscription', { organization_id: org, plan_id: 'test-quote' });
    await change('subscription', { organization_id: org, plan_id: 'test-quote' });
    await change('membership', { organization_id: org, user_id: user, store_id: store, role: 'store_user', status: 'active' });
    await change('user_permission', { organization_id: org, user_id: user, permission_key: 'products.manage', allowed: true });
    assert.ok((await val(db, "select platform_admin_read('audit')")).total >= 2);
    await as(db, user);
    assert.deepEqual((await db.query('select id from campaigns')).rows, [{ id: 'expert-campaign' }]);
    await assert.rejects(() => val(db, "select platform_admin_read('audit')"));
    await assert.rejects(() => db.query('select * from subscriptions'));
    await db.exec('reset role');
    assert.equal(await val(db, 'select count(*)::int from subscriptions'), 1);
    assert.equal(await val(db, 'select count(*)::int from organization_members where organization_id=$1 and user_id=$2', [org, user]), 1);
  });

  await check('complete schema preserves populated billing and audit without redundant keys', '', async db => {
    await db.exec("insert into plans(id,name,features) values('paid-existing','Existing','{\"custom\":true}'); insert into subscriptions(organization_id,plan_id,status,provider) values('20000000-0000-4000-8000-000000000001','paid-existing','active','stripe'); insert into audit_logs(action,entity_type,metadata) values('existing.event','orders','{\"source\":\"legacy\"}')");
    const before = new Map();
    for (const table of ['plans', 'subscriptions', 'audit_logs']) before.set(table, await rows(db, table));
    await db.exec(migration);
    await db.exec(migration);
    for (const table of before.keys()) assert.deepEqual(await rows(db, table), before.get(table), table);
    assert.equal(await val(db, "select count(*)::int from pg_indexes where indexname in ('phase_zero_members_org_user_key','phase_zero_stores_org_code_key','phase_zero_subscriptions_org_key')"), 0);
    assert.deepEqual((await val(db, 'select snapshot from platform_migration_snapshots')).foundation_tables_created, []);
  });

  await check('mixed schema creates only missing audit table and preserves existing grants', 'drop table audit_logs;', async db => {
    await db.exec('grant select on plans to authenticated');
    await db.exec(migration);
    assert.deepEqual((await val(db, 'select snapshot from platform_migration_snapshots')).foundation_tables_created, ['audit_logs']);
    assert.equal(await val(db, "select has_table_privilege('authenticated','plans','select')"), true);
  });

  for (const spec of [
    { table: 'organization_members', insert: `insert into organization_members(organization_id,user_id,role,store_id) select organization_id,user_id,role,store_id from organization_members where user_id='${user}'` },
    { table: 'stores', insert: `insert into stores(organization_id,name,code) values('${org}','Outra designação','centro')` },
  ]) {
    await check(`duplicate ${spec.table} aborts and rolls back new administrative tables`, partial, async db => {
      await db.exec(spec.insert);
      const before = await rows(db, spec.table);
      await rejected(db, new RegExp(`registos duplicados em ${spec.table}`));
      assert.deepEqual(await rows(db, spec.table), before);
      await noFoundation(db);
    });
  }

  await check('duplicate subscriptions are never merged or reassigned', '', async db => {
    await db.exec(`alter table subscriptions drop constraint subscriptions_organization_id_key; insert into subscriptions(organization_id,provider) values('${org}','stripe'),('${org}','paddle')`);
    const before = await rows(db, 'subscriptions');
    await rejected(db, /registos duplicados em subscriptions/);
    assert.deepEqual(await rows(db, 'subscriptions'), before);
    assert.equal(await val(db, "select to_regclass('public.platform_migration_snapshots')"), null);
  });

  await check('partial unique index is supplemented for composite foreign keys', partial, async db => {
    await db.exec('create unique index legacy_member_partial on organization_members(organization_id,user_id) where user_id is not null');
    await db.exec(migration);
    assert.ok(await val(db, "select to_regclass('public.phase_zero_members_org_user_key')"));
    await db.exec(migration);
    await assert.rejects(() => db.query('insert into user_permissions(organization_id,user_id,permission_key,allowed) values($1,$2,$3,true)', [org, ceo, 'products.read']), /foreign key/);
  });

  await check('incompatible existing plan identifier is reported before creating dependants', partial, async db => {
    await db.exec('create table plans(id uuid primary key,name text)');
    await rejected(db, /plans.id \(text\)/);
    assert.equal(await val(db, "select to_regclass('public.subscriptions')"), null);
    assert.equal(await val(db, "select to_regclass('public.audit_logs')"), null);
  });

  await check('all missing legacy billing columns are reported without guessing conversion', '', async db => {
    await db.exec('alter table subscriptions rename column plan_id to plan_code; alter table audit_logs drop column metadata');
    await rejected(db, /audit_logs.metadata.*subscriptions.plan_id/);
    assert.equal(await val(db, "select count(*)::int from information_schema.columns where table_schema='public' and table_name='subscriptions' and column_name='plan_code'"), 1);
  });

  await check('missing tenant foundation is inventoried but never invented', null, async db => {
    const result = (await db.exec(preflight)).at(-1).rows[0].phase_zero_inventory;
    assert.deepEqual(result.missing_required_tables, ['organizations', 'stores', 'organization_members', 'profiles']);
    assert.deepEqual(result.expert, []);
    await rejected(db, /tabela obrigatória em falta: organizations/);
    await noFoundation(db);
  });

  await check('legacy privilege review is still required on a partial schema', partial, async db => {
    await db.exec("set promopilot.legacy_admin_user_ids=''");
    await rejected(db, /preparePlatformMigration/);
    await noFoundation(db);
  });

  await check('POS installs after the repaired foundation and survives CEO migration re-run', partial, async db => {
    await db.exec(migration);
    await db.exec(pos);
    await db.exec("update organization_features set enabled=true where organization_id='20000000-0000-4000-8000-000000000001' and module_key='pos'");
    await db.exec(migration);
    assert.equal(await val(db, "select implemented from feature_modules where module_key='pos'"), true);
    assert.equal(await val(db, "select enabled from organization_features where organization_id=$1 and module_key='pos'", [org]), true);
    assert.ok(await val(db, "select to_regclass('public.pos_orders')"));
  });
  return passed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log(`Foundation: ${await runFoundationTests()} PostgreSQL regression scenarios passed (synthetic data).`);
}
