import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerHealthRoutes } from '../routes/health.js';
test('public liveness remains compatible with HTTP monitors without commercial database counts',async()=>{
 const app=express();registerHealthRoutes(app,{});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
  const r=await fetch(`http://127.0.0.1:${server.address().port}/api/health`);const body=await r.json();
  assert.equal(r.status,200);assert.equal(body.ok,true);assert.equal(body.kind,'liveness');assert.equal(body.database,undefined);assert.equal(r.headers.get('cache-control'),'no-store');
 }finally{await new Promise(r=>server.close(r));}
});
