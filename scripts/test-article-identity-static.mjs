// Offline guardrails. These do NOT replace PostgreSQL integration tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const maintenance = [
  'scripts/import-artigos-to-supabase.mjs',
  'scripts/migrate-artigos-prices-to-supabase.mjs',
  'scripts/migrate-artigos-db-update-to-supabase.mjs',
];
for (const file of maintenance) {
  test(`${file} requires explicit tenant and scoped conflict`, () => {
    const text=read(file);
    assert.match(text,/ARTICLE_MIGRATION_ORGANIZATION_ID/);
    assert.match(text,/organization_id: ORGANIZATION_ID/);
    assert.match(text,/onConflict: "organization_id,artigo"/);
    assert.doesNotMatch(text,/onConflict: "artigo"/);
    assert.doesNotMatch(text,/^<<<<<<< |^>>>>>>> /m);
  });
}
test('backend admin lookup refuses ambiguous organization',()=>{
  const text=read('server/services/articleRepository.js');
  const start=text.indexOf('export async function findArticleByIdentifiers');
  const end=text.indexOf('export async function findArticleForSellerAssistant',start);
  const body=text.slice(start,end);
  assert.match(body,/if \(!organizationId\)/);
  assert.match(body,/\.eq\("organization_id", organizationId\)/);
  assert.doesNotMatch(body,/\.or\(`/);
});
test('expand preserves legacy key; cutover explicitly gates',()=>{
  const expand=read('supabase/migrations/20261019010000_articles_identity_expand.sql');
  const cutover=read('supabase/manual/20261019012000_articles_identity_cutover.sql');
  assert.doesNotMatch(expand,/DROP CONSTRAINT articles_pkey/i);
  assert.match(cutover,/Foreign keys reference old article primary key/);
  assert.match(cutover,/organization_id IS NULL OR article_id IS NULL/);
  assert.match(cutover,/PRIMARY KEY USING INDEX articles_article_id_uidx/);
  assert.match(cutover,/UNIQUE USING INDEX articles_organization_artigo_uidx/);
  assert.match(cutover,/protect_article_identity/);
});

// Execute the real administrative lookup body against an isolated fake query
// adapter, so these tests check behavior rather than only matching text.
function compileAdministrativeArticleLookup(rows, calls) {
  const text=read('server/services/articleRepository.js');
  const start=text.indexOf('export async function findArticleByIdentifiers');
  const end=text.indexOf('export async function findArticleForSellerAssistant', start);
  const declaration=text.slice(start,end).replace('export async function','async function');
  const source=`${declaration}\nreturn findArticleByIdentifiers;`;
  const client={
    from(name) {
      assert.equal(name,'articles');
      const conditions=[];
      return {
        select() { return this; },
        eq(field,value) { conditions.push([field,value]);return this; },
        limit() { return this; },
        async maybeSingle() {
          calls.push(conditions);
          return {data: rows.find(row=>conditions.every(([k,v])=>row[k]===v))||null,error:null};
        },
      };
    },
  };
  return new Function('requireAdminClient','getUserClient','ARTICLES_TABLE','ARTICLE_SELECT','mapRowToArticle',source)(
    ()=>client,()=>{throw new Error('not used');},'articles','artigo,organization_id',r=>r,
  );
}

test('admin article lookup fails closed with no tenant and selects the intended duplicate',async()=>{
  const first='20000000-0000-4000-8000-000000000001';
  const second='20000000-0000-4000-8000-000000000002';
  const calls=[];
  const find=compileAdministrativeArticleLookup([
    {artigo:'10025',codigo_barras:'ean',organization_id:first,descricao:'A'},
    {artigo:'10025',codigo_barras:'ean',organization_id:second,descricao:'B'},
  ],calls);
  await assert.rejects(()=>find({artigoInterno:'10025'}),/Organização obrigatória/);
  assert.equal((await find({artigoInterno:'10025',organizationId:second})).descricao,'B');
  assert.equal((await find({codigoBarras:'ean',organizationId:first})).descricao,'A');
  assert.ok(calls.every(cs=>cs.some(([key])=>key==='organization_id')));
});
