import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite({ extensions:{pg_trgm} });
const org='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function auth.role() returns text language sql as $$select current_setting('test.role',true)$$;
create function public.resolve_article_rpc_organization(p uuid) returns uuid language plpgsql as $$begin
 if p is distinct from '${org}'::uuid then raise exception 'Forbidden organization'; end if; return p; end$$;
create table articles(artigo text primary key, organization_id uuid, descricao text, pvp1 text, pvp2 text, pvp3 text, estado text, codigo_barras text, titulo_oficial text, descricao_oficial text, marca text, modelo text, brand text, categoria text, subcategory text);
select set_config('test.uid','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
select set_config('test.role','authenticated',false);
insert into articles(artigo,organization_id,descricao,pvp2,codigo_barras,marca) values
('01.200.300','${org}','Máquina Bosch lavar','799,99','5601234567890','Bosch'),
('OTHER','${other}','Máquina Bosch privada','1','999','Bosch');
insert into articles(artigo,organization_id,descricao,pvp2,codigo_barras,marca)
select 'SKU'||lpad(i::text,7,'0'),'${org}', case when i%97=0 then 'Máquina Bosch lavar ' else 'Produto comum ' end || i, '100', (5600000000000+i)::text, case when i%97=0 then 'Bosch' else 'Generic' end from generate_series(1,250000) i;
`);
const sql=fs.readFileSync(new URL('../../supabase/migrations/20261006_articles_fast_search.sql',import.meta.url),'utf8');
await db.exec(sql); await db.exec(sql);
async function search(q,limit=10,offset=0,tenant=org){return (await db.query('select * from public.search_articles_fast($1,$2,$3,$4)',[q,limit,offset,tenant])).rows;}
for (const q of ['01.200.300','01200300','5601234567890']) {
 const r=await search(q); assert.equal(r[0].artigo,'01.200.300'); assert.equal(r[0].pvp2,'799,99');
}
assert.equal((await search('xxnothing')).length,0);
assert.equal((await search('')).length,0);
assert.equal((await search('ma'))[0].artigo,'01.200.300');
assert.equal((await search('lavar bosch'))[0].artigo,'01.200.300');
const first=await search('maquina',10,0),second=await search('maquina',10,10);
assert.equal(first.length,10);assert.equal(second.length,10);assert.equal(Number(first[0].total_count),11);
assert(!first.some(x=>second.some(y=>x.artigo===y.artigo)));
assert(!(await search('bosch',50)).some(x=>x.artigo==='OTHER'));
await assert.rejects(search('bosch',10,0,other),/Forbidden/);
await db.exec("select set_config('test.uid','',false); select set_config('test.role','anon',false)");
await assert.rejects(search('bosch'),/Authentication required/);
await db.exec("select set_config('test.role','service_role',false)");
for(const q of ['01200300','lavar bosch','xxnothing','ma','produto','sku']) {
 const timings=[]; for(let i=0;i<3;i++){const t=performance.now();await search(q);timings.push(Math.round(performance.now()-t));} console.log(q,timings);
}
console.log('PASS: migration twice, exact/compact/EAN, accents, words, pagination, tenant and anonymous rejection');
await db.close();
