import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
let calls=[];
await mock.module('../lib/supabaseClients.js',{namedExports:{supabaseAdminClient:null,createSupabaseUserClient:()=>({async rpc(name,args){calls.push({name,args});return {data:{duplicate:false,processed:args.p_received}};}})}});
const {processArticleDatabaseSyncBatch}=await import('../services/articleDatabaseSyncService.js');
const req=()=>({accessToken:'synthetic',organizationId:'20000000-0000-4000-8000-000000000001',storeId:null});
test('a 300-article batch uses one transactional RPC instead of per-article HTTP writes',async()=>{
 calls=[];const rows=Array.from({length:300},(_,i)=>({artigo:`qa-${i}`,pvp2:'1 049,99'}));
 await processArticleDatabaseSyncBatch({req:req(),syncId:'synthetic',batchIndex:0,rows});
 assert.equal(calls.length,1);assert.equal(calls[0].name,'platform_article_sync_batch');assert.equal(calls[0].args.p_rows[0].pvp2,1049.99);
});
test('normalization retains zero, ignores missing prices and keeps the final duplicate',async()=>{
 calls=[];await processArticleDatabaseSyncBatch({req:req(),syncId:'synthetic',batchIndex:0,rows:[{artigo:'qa',pvp2:5},{artigo:'qa',pvp2:0},{artigo:'omitted'}]});
 assert.deepEqual(calls[0].args.p_rows,[{artigo:'qa',pvp2:0}]);assert.equal(calls[0].args.p_received,2);
});
test('oversized raw batch is refused before normalization or database requests',async()=>{
 calls=[];await assert.rejects(processArticleDatabaseSyncBatch({req:req(),syncId:'synthetic',batchIndex:0,rows:Array(301).fill({})}),e=>e.code==='VALIDATION_ERROR');assert.equal(calls.length,0);
});
