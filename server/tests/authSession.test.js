import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
let response = {}, calls = 0;
const profileQuery = { select(){return this;}, eq(){return this;}, async maybeSingle(){return {data:{role:'admin'}};} };
await mock.module('../lib/supabaseClients.js', {namedExports:{
  hasSupabaseAuthConfig:()=>true, hasSupabaseAdminConfig:()=>false, supabaseAdminClient:null,
  supabaseAuthClient:{auth:{getUser:async()=>{calls++; return response;}}},
  createSupabaseUserClient:()=>({from:()=>profileQuery}),
}});
const { requireAuth } = await import('../middleware/auth.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
async function run(token='test-token') {
  const req={headers:{authorization:token ? `Bearer ${token}` : ''},path:'/api/access',method:'GET',requestId:'req-test'};
  const res={code:200,status(value){this.code=value;return this;},json(value){this.body=value;return this;}};
  let authorized=false;
  await requireAuth(req,res,error=>{if(error)errorHandler(error,req,res,()=>{});else authorized=true;});
  return {req,res,authorized};
}
test('authentication network failures return 503, never a false invalid-session 401',async()=>{
 response={error:{name:'AuthRetryableFetchError',status:0,message:'network issue secret-token'}};
 const {res,authorized}=await run(); assert.equal(res.code,503); assert.equal(authorized,false);
 assert.ok(!JSON.stringify(res.body).includes('secret-token'));
});
test('valid JWT passes but metadata/profile cannot grant admin',async()=>{
 response={data:{user:{id:'qa-user',user_metadata:{role:'admin'}}}};
 const {req,authorized}=await run(); assert.equal(authorized,true); assert.equal(req.isAdmin,false);
});
test('missing, expired and banned sessions fail closed',async()=>{
 const before=calls; assert.equal((await run('')).res.code,401); assert.equal(calls,before);
 response={error:{status:401,code:'bad_jwt'}}; assert.equal((await run()).res.code,401);
 response={data:{user:{id:'qa',banned_until:'2099-01-01'}}}; assert.equal((await run()).res.code,401);
});
test('unknown and upstream server errors cannot be interpreted as invalid credentials',async()=>{
 for(const error of [{status:503},{name:'TypeError',message:'fetch failed'}, {status:500}]) {
   response={error}; const result=await run(); assert.equal(result.res.code,503); assert.equal(result.authorized,false);
 }
});
test('authentication timeout is bounded and fails closed with 503',async()=>{
 const {authDeadline}=await import('../middleware/auth.js');
 await assert.rejects(authDeadline(new Promise(()=>{}),5),error=>error.status===503&&error.code==='AUTH_UNAVAILABLE');
});
