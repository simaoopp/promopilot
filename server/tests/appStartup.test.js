import { test } from 'node:test';
import assert from 'node:assert/strict';
// Synthetic config only. Missing tokens are rejected locally; no external auth,
// database, email provider or AI request is made by this startup check.
process.env.SUPABASE_URL='https://supabase.example.test';
process.env.SUPABASE_PUBLISHABLE_KEY='synthetic-public-test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY='';
process.env.GEMINI_API_KEY='';
const {createApp}=await import('../app.js');
const {verifyApiDeployment}=await import('../../scripts/verify-api-deployment.mjs');
test('complete API starts with shared modules and exposes the protected access contract',async()=>{
 const app=createApp();const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.deepEqual(await verifyApiDeployment(base),{ok:true});
  assert.equal((await fetch(base+'/api/ceo/dashboard')).status,401);
  assert.equal((await fetch(base+'/api/health')).status,200);
  assert.equal((await fetch(base+'/api/not-a-route')).status,404);
  assert.equal((await fetch(base+'/api/orcamentos-dossiers/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:'invalid json'})).status,401);
 }finally{await new Promise(r=>server.close(r));}
});
