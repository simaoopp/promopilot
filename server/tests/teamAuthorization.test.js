import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const org='20000000-0000-4000-8000-000000000001';
const store='30000000-0000-4000-8000-000000000001';
let permit=false, setupFailure=false, deleted=0, invited=0, rpcCalls=[];
const client={
  from(table){return {
    select(){return this;},eq(){return this;},
    then(resolve){return Promise.resolve({data:[{id:store,name:'Loja Teste'}]}).then(resolve);},
    async upsert(){return {error:setupFailure ? {code:'08006'} : null};},
    async insert(){return {error:null};},
  };},
  auth:{admin:{async inviteUserByEmail(){invited++;return {data:{user:{id:'10000000-0000-4000-8000-000000000001'}}};},async deleteUser(){deleted++;}}},
};
await mock.module('../lib/supabaseClients.js',{namedExports:{supabaseAdminClient:client,supabaseAuthClient:null,
 createSupabaseUserClient:()=>({async rpc(name,args){rpcCalls.push({name,args});return {data:name==='platform_can_invite_member'?permit:name==='platform_permission'?true:{items:[],total:0}};}}),
}});
const {registerSaasAdminRoutes}=await import('../routes/saasAdmin.js');
const {errorHandler}=await import('../middleware/errorHandler.js');
const app=express();app.use(express.json());
const auth=(req,_res,next)=>{Object.assign(req,{accessToken:'synthetic',organizationId:org,storeId:store,organizationRole:'admin',auth:{email:'actor@example.test'}});next();};
registerSaasAdminRoutes(app,{requireAuth:auth,requireAdmin:(_req,_res,next)=>next()});
app.use(errorHandler);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`;
const invite=()=>fetch(`${base}/api/admin/users/invite`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'invite@example.test',firstName:'Teste',lastName:'QA',store:'Loja Teste',role:'admin'})});
test('team administration enforces target scope before external effects',async t=>{
 try {
  await t.test('target scope denial prevents invitation and privilege assignment',async()=>{
   assert.equal((await invite()).status,403);assert.equal(invited,0);
   assert.deepEqual(rpcCalls.find(c=>c.name==='platform_can_invite_member').args,{p_org:org,p_store:store,p_role:'admin'});
  });
  await t.test('malformed authorization result is denied',async()=>{permit={allowed:true};assert.equal((await invite()).status,403);assert.equal(invited,0);});
  await t.test('authorized invitation preserves existing response',async()=>{permit=true;assert.equal((await invite()).status,201);assert.equal(invited,1);});
  await t.test('failed setup never deletes a potentially existing Auth account',async()=>{setupFailure=true;assert.equal((await invite()).status,500);assert.equal(deleted,0);});
  await t.test('legacy CEO audit endpoint uses restricted platform audit RPC',async()=>{
   rpcCalls=[];const r=await fetch(`${base}/api/admin/audit-logs`);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(rpcCalls[0].args.p_resource,'audit');
  });
  await t.test('legacy organization creation uses transactional audited mutation',async()=>{
   rpcCalls=[];const r=await fetch(`${base}/api/admin/organizations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Synthetic QA',slug:'synthetic-qa'})});assert.equal(r.status,201);assert.equal(rpcCalls[0].name,'platform_admin_mutate');
  });
 }finally{await new Promise(r=>server.close(r));mock.restoreAll();}
});
