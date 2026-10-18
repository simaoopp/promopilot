import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

// HTTP transport tests exercise the actual middlewares/routes. PostgreSQL rules have
// a separate integration suite with RLS, permissions, audits and synthetic tenants.
const org='20000000-0000-4000-8000-000000000001';
const store='30000000-0000-4000-8000-000000000001';
let platformAdmin=false, allowed=false, failAccess=false, calls=[];
const profileQuery={select(){return this;},eq(){return this;},async maybeSingle(){return {data:{role:'admin',store:'forged-store'}};}};
await mock.module('../lib/supabaseClients.js', { namedExports: {
  hasSupabaseAuthConfig:()=>true, hasSupabaseAdminConfig:()=>false, supabaseAdminClient:null,
  supabaseAuthClient:{auth:{async getUser(token){return token==='valid' ? {data:{user:{id:'10000000-0000-4000-8000-000000000001',email:'qa@example.test',user_metadata:{role:'ceo',isAdmin:true}}}} : {error:{message:'invalid'}};}}},
  createSupabaseUserClient:()=>({from:()=>profileQuery,async rpc(name,args){
    calls.push({name,args});
    if(failAccess) return {error:{code:'08006'}};
    if(name==='platform_access_context') {
      if(args.p_organization_id && args.p_organization_id!==org) return {error:{code:'42501'}};
      return {data:{platformAdmin,organizationId:org,storeId:store,role:'admin',organizations:[{id:org}],stores:[{id:store,name:'Praia',status:'active'}],permissions:{'products.read':allowed}}};
    }
    if(name==='platform_permission')return {data:allowed};
    if(name==='platform_admin_read')return {data:{items:[],total:0}};
    if(name==='platform_admin_mutate')return {data:{saved:true}};
    return {data:null};
  }}),
}});
const {requireAuth, requireAdmin, buildAuthContext}=await import('../middleware/auth.js');
const {attachTenantContext}=await import('../middleware/tenant.js');
const {requirePermission}=await import('../services/platform/accessService.js');
const {registerPlatformRoutes}=await import('../routes/platform.js');
const {errorHandler}=await import('../middleware/errorHandler.js');
const app=express();app.use(express.json());
registerPlatformRoutes(app,{authStack:[requireAuth,attachTenantContext],requireAdmin});
app.get('/api/private-product',requireAuth,attachTenantContext,requirePermission('products.read'),(_req,res)=>res.json({ok:true}));
app.use(errorHandler);
const server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
async function request(path,options={}){return fetch(base+path,{...options,headers:{Authorization:'Bearer valid','Content-Type':'application/json',...options.headers}});}

test('platform access HTTP contract',async t=>{
 try {
  await t.test('metadata/profile roles never confer global status',()=>{
    assert.equal(buildAuthContext({user_metadata:{role:'admin',isAdmin:true},app_metadata:{role:'admin'}},{role:'admin'}).isAdmin,false);
  });
  await t.test('missing/invalid authentication is rejected',async()=>{
    assert.equal((await request('/api/ceo/dashboard',{headers:{Authorization:''}})).status,401);
    assert.equal((await request('/api/ceo/dashboard',{headers:{Authorization:'Bearer bad'}})).status,401);
  });
  await t.test('ordinary org admin cannot call CEO reads or mutations',async()=>{
    platformAdmin=false;calls=[];
    assert.equal((await request('/api/ceo/dashboard')).status,403);
    assert.equal((await request('/api/ceo/change',{method:'POST',body:JSON.stringify({entity:'organization_feature',data:{organization_id:org,module_key:'pos',enabled:true}})})).status,403);
    assert.ok(!calls.some(call=>call.name==='platform_admin_mutate'));
  });
  await t.test('module/action deny blocks API and allow is rechecked on each call',async()=>{
    allowed=false;assert.equal((await request('/api/private-product')).status,403);
    allowed=true;assert.equal((await request('/api/private-product')).status,200);
    allowed=false;assert.equal((await request('/api/private-product')).status,403);
  });
  await t.test('tenant spoofing and malformed tenant headers are rejected',async()=>{
    assert.equal((await request('/api/access',{headers:{'X-Organization-Id':'20000000-0000-4000-8000-000000000002'}})).status,403);
    assert.equal((await request('/api/access',{headers:{'X-Organization-Id':'not-an-id'}})).status,400);
  });
  await t.test('access service outage fails closed',async()=>{
    failAccess=true;assert.equal((await request('/api/private-product')).status,503);failAccess=false;
  });
  await t.test('CEO scoped mutation and global read use user JWT RPC, responses are not cached',async()=>{
    platformAdmin=true;calls=[];
    const read=await request('/api/ceo/organizations');assert.equal(read.status,200);assert.equal(read.headers.get('cache-control'),'no-store');
    const data={organization_id:org,module_key:'pos',enabled:true};
    const save=await request('/api/ceo/change',{method:'POST',body:JSON.stringify({entity:'organization_feature',data})});assert.equal(save.status,200);
    assert.deepEqual(calls.find(call=>call.name==='platform_admin_mutate').args,{p_entity:'organization_feature',p_data:data});
  });
  await t.test('access polling makes one full context RPC, never two',async()=>{
    calls=[];
    assert.equal((await request('/api/access')).status,200);
    assert.equal(calls.filter(c=>c.name==='platform_access_context').length,1);
    assert.equal(calls[0].args.p_include_permissions,true);
  });
  await t.test('truthy malformed permission results fail closed',async()=>{
    allowed={allowed:true};
    assert.equal((await request('/api/private-product')).status,403);
    allowed=false;
  });
  await t.test('CEO does not bypass ordinary module restrictions',async()=>{
    platformAdmin=true;allowed=false;assert.equal((await request('/api/private-product')).status,403);
  });
 } finally { await new Promise(resolve=>server.close(resolve)); mock.restoreAll(); }
});
