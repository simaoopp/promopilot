import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const calls = [];
const ORG_A = '20000000-0000-4000-8000-000000000001';
const ORG_B = '20000000-0000-4000-8000-000000000002';
const fakeClient = {
  from(table) {
    calls.push(['from', table]);
    return {
      select(columns) { calls.push(['select', columns]); return this; },
      eq(column, value) { calls.push(['eq', column, value]); return this; },
      limit(limit) { calls.push(['limit', limit]); return this; },
      or(filter) { calls.push(['or', filter]); return this; },
      async maybeSingle() {
        const organization = calls.find(entry => entry[0] === 'eq' && entry[1] === 'organization_id')?.[2];
        if (organization !== ORG_A) return { data: null, error: null };
        return { data: { artigo: '10025', descricao: 'Artigo A' }, error: null };
      },
    };
  },
};
await mock.module('../lib/supabaseClients.js', {
  namedExports: { supabaseAdminClient: fakeClient, createSupabaseUserClient: () => null },
});
const { findArticleByIdentifiers } = await import('../services/articleRepository.js');

test('admin lookup fails closed if organizationId is missing', async () => {
  calls.length = 0;
  await assert.rejects(findArticleByIdentifiers({ artigoInterno: '10025' }), /Organização obrigatória/);
  assert.equal(calls.length, 0, 'service_role must not query without a tenant');
});

test('admin article lookup uses organizationId even when a commercial code matches', async () => {
  calls.length = 0;
  const article = await findArticleByIdentifiers({ artigoInterno: '10025', organizationId: ORG_A });
  assert.equal(article.artigo, '10025');
  assert.ok(calls.some(entry => entry[0] === 'eq' && entry[1] === 'organization_id' && entry[2] === ORG_A));
  calls.length = 0;
  const other = await findArticleByIdentifiers({ artigoInterno: '10025', organizationId: ORG_B });
  assert.equal(other, null);
  assert.ok(calls.some(entry => entry[0] === 'eq' && entry[1] === 'organization_id' && entry[2] === ORG_B));
});

test('admin lookup by barcode is also scoped to organization', async () => {
  calls.length = 0;
  await findArticleByIdentifiers({ codigoBarras: '5600000000001', organizationId: ORG_A });
  assert.ok(calls.some(entry => entry[0] === 'eq' && entry[1] === 'organization_id'));
  assert.ok(calls.some(entry => entry[0] === 'eq' && entry[1] === 'codigo_barras'));
});
