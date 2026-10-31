// Real installed Supabase SDK, isolated in-memory browser storage and mocked
// Auth HTTP. No project credentials, database or external network are used.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const key='sb-auth-qa-auth-token';
const user={id:'10000000-0000-4000-8000-000000000001',aud:'authenticated',role:'authenticated',email:'qa@example.test'};
function session(expired=false,refresh='synthetic-refresh') {
 const expiry=Math.floor(Date.now()/1000)+(expired?-3600:3600);
 const token=[{alg:'HS256',typ:'JWT'},{sub:user.id,aud:'authenticated',exp:expiry,role:'authenticated'},'test-signature'].map(value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url')).join('.');
 return {access_token:token,refresh_token:refresh,token_type:'bearer',expires_in:3600,expires_at:expiry,user};
}
function fixture(initial,fetch) {
 const values=new Map([['sb-another-auth-token','unrelated'],['preference','keep']]);
 if(initial)values.set(key,JSON.stringify(initial));
 const storage={getItem:name=>values.get(name)??null,setItem:(name,value)=>values.set(name,value),removeItem:name=>values.delete(name)};
 const client=()=>createClient('https://auth-qa.invalid','synthetic-public-key',{global:{fetch},auth:{storage,storageKey:key,persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
 return {values,client};
}
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','X-Supabase-Api-Version':'2024-01-01'}});}
test('real SDK removes an invalid refresh locally and accepts a new password login',async t=>{
 const original=console.error;
 t.mock.method(console,'error',error=>{if(error?.code!=='refresh_token_not_found')original(error);});
 let calls=0;
 const {values,client}=fixture(session(true,'invalid-refresh'),async(url,options)=>{
  calls++;
  assert.equal(new URL(url).hostname,'auth-qa.invalid');
  if(String(url).includes('grant_type=refresh_token'))return json({code:'refresh_token_not_found',message:'Invalid Refresh Token: Refresh Token Not Found'},400);
  assert.ok(String(url).includes('grant_type=password'));assert.equal(JSON.parse(options.body).email,user.email);
  return json(session(false,'replacement-refresh'));
 });
 const auth=client().auth;
 const failed=await auth.getSession();assert.equal(failed.error.code,'refresh_token_not_found');
 assert.equal(values.has(key),false);assert.equal(values.get('sb-another-auth-token'),'unrelated');assert.equal(values.get('preference'),'keep');
 const login=await auth.signInWithPassword({email:user.email,password:'synthetic-password'});
 assert.equal(login.error,null);assert.equal(login.data.user.id,user.id);
 assert.equal(JSON.parse(values.get(key)).refresh_token,'replacement-refresh');assert.equal(calls,2);
});
test('real SDK rotates once for concurrent reads of an expired session',async()=>{
 let calls=0;
 const {values,client}=fixture(session(true),async url=>{
  assert.ok(String(url).includes('grant_type=refresh_token'));calls++;return json(session(false,'rotated-refresh'));
 });
 const auth=client().auth;
 const [a,b]=await Promise.all([auth.getSession(),auth.getSession()]);
 assert.equal(a.error,null);assert.equal(b.error,null);assert.equal(calls,1);
 assert.equal(a.data.session.refresh_token,b.data.session.refresh_token);
 assert.equal(JSON.parse(values.get(key)).refresh_token,'rotated-refresh');
});
test('recreating the SDK restores a valid stored session without a login/refresh request',async()=>{
 const {values,client}=fixture(session(),async()=>{throw new Error('Unexpected HTTP request');});
 const first=await client().auth.getSession();const reopened=await client().auth.getSession();
 assert.equal(first.data.session.user.id,user.id);assert.equal(reopened.data.session.user.id,user.id);assert.equal(values.has(key),true);
});
test('an empty private-session storage is unauthenticated without a network request',async()=>{
 const {client}=fixture(null,async()=>{throw new Error('Unexpected HTTP request');});
 const result=await client().auth.getSession();assert.equal(result.data.session,null);assert.equal(result.error,null);
});
test('local logout does not request global revocation and preserves unrelated state',async()=>{
 let calls=0;
 const {values,client}=fixture(session(),async url=>{
  calls++;assert.ok(String(url).includes('/logout?scope=local'));return new Response(null,{status:204});
 });
 const auth=client().auth;await auth.getSession();const result=await auth.signOut({scope:'local'});
 assert.equal(result.error,null);assert.equal(calls,1);assert.equal(values.has(key),false);assert.equal(values.get('sb-another-auth-token'),'unrelated');
});
