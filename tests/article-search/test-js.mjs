import fs from 'node:fs';
import assert from 'node:assert/strict';
import { parse } from '@babel/parser';
const base=new URL('../../',import.meta.url);
async function load(path,deps){
 let s=fs.readFileSync(new URL(path,base),'utf8');
 const ast=parse(s,{sourceType:'module'});
 for(const n of ast.program.body.filter(n=>n.type==='ImportDeclaration'&&!n.source.value.startsWith('node:')).reverse())
   s=s.slice(0,n.start)+s.slice(n.end);
 globalThis.__testDeps=deps;
 s='const {'+Object.keys(deps).join(',')+'}=globalThis.__testDeps;\n'+s;
 return import('data:text/javascript;base64,'+Buffer.from(s).toString('base64'));
}
let token='alice',calls=0,mode='ok';
const deps={supabase:{auth:{getSession:async()=>({data:{session:{access_token:token}}})}},isSupabaseRefreshTokenError:()=>false,recoverFromInvalidSupabaseSession:()=>{},readPersistedArtigos:()=>{},writePersistedArtigos:()=>{}};
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify(mode==='degraded'?{ok:true,items:[],searchTimedOut:true,degraded:true}:{ok:true,items:[{artigo:token}],total:1}),{status:200,headers:{'content-type':'application/json'}});};
const front=await load('src/services/artigosService.js',deps);
let c=new AbortController();const canceled=front.searchArtigos({q:'cancel',signal:c.signal});c.abort();
await assert.rejects(canceled,e=>e.name==='AbortError');assert.equal(calls,0);
await Promise.all([front.searchArtigos({q:'bosch'}),front.searchArtigos({q:'bosch'})]);assert.equal(calls,1);
await front.searchArtigos({q:'bosch'});assert.equal(calls,1);
token='bob';assert.equal((await front.searchArtigos({q:'bosch'})).items[0].artigo,'bob');assert.equal(calls,2);
mode='degraded';await assert.rejects(front.searchArtigos({q:'slow'}));
mode='ok';await front.searchArtigos({q:'slow'});assert.equal(calls,4);
// Timeout remains active until the body is read, not just until headers arrive.
globalThis.fetch=async(_url,{signal})=>({ok:true,text:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}))});
await assert.rejects(front.fetchArtigosPage({q:'body',timeoutMs:15}),/demorou/);
globalThis.fetch=originalFetch;
let rpcCalls=0;
const back=await load('server/services/articleRepository.js',{
 supabaseAdminClient:null,
 createSupabaseUserClient:t=>({rpc:async(name)=>{assert.equal(name,'search_articles_fast');rpcCalls++;await new Promise(r=>setTimeout(r,5));return {data:[{artigo:t,total_count:1}]};}})
});
const args={q:'bosch',organizationId:'org',accessToken:'alice'};
await Promise.all([back.listArticles(args),back.listArticles(args)]);assert.equal(rpcCalls,1);
await back.listArticles(args);assert.equal(rpcCalls,1);
assert.equal((await back.listArticles({...args,accessToken:'bob'})).items[0].artigo,'bob');assert.equal(rpcCalls,2);
console.log('PASS: frontend cancellation, cache/session isolation, request coalescing, degraded retry, body timeout; API coalescing/session isolation');
