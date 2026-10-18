import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyApiDeployment } from '../../scripts/verify-api-deployment.mjs';
import { normalizeApiBaseUrl } from '../../src/shared/apiBaseUrl.mjs';
test('API deployment origin normalization never retains credentials or query strings',()=>{
 assert.equal(normalizeApiBaseUrl('  https://api.example.test/api///  '),'https://api.example.test');
 for(const url of ['https://user:secret@api.example.test','https://api.example.test?token=secret','https://api.example.test/x','javascript:alert(1)','http://api.example.test'])assert.throws(()=>normalizeApiBaseUrl(url));
});
test('pre-publication check requires JSON 401 and sends no credentials',async()=>{
 assert.deepEqual(await verifyApiDeployment('https://api.example.test',async(url,options)=>{
  assert.equal(url,'https://api.example.test/api/access');assert.equal(options.headers,undefined);assert.equal(options.redirect,'manual');
  return {status:401,json:async()=>({ok:false,error:'Authentication required'})};
 }),{ok:true});
});
test('old backend, SPA fallback, unavailable auth and unprotected routes block publication',async()=>{
 for(const status of [200,302,404,503])await assert.rejects(verifyApiDeployment('https://api.example.test',async()=>({status,json:async()=>({ok:false,error:'test'})})));
 await assert.rejects(verifyApiDeployment('https://api.example.test',async()=>({status:200,json:async()=>{throw new Error('HTML');}})));
 await assert.rejects(verifyApiDeployment(''));
});
