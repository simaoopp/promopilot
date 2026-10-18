import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { installBodyParsers, dossierBodyParser } from '../middleware/payloadLimits.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { requestContext, getRequestMeta } from '../middleware/requestContext.js';

test('payload boundaries preserve PDF requests while limiting anonymous JSON',async t=>{
 const app=express();app.use(requestContext);
 app.post('/signed-webhook',express.raw({type:'application/json'}),(req,res)=>res.json({raw:Buffer.isBuffer(req.body)}));
 installBodyParsers(app);
 app.post('/api/example',(_req,res)=>res.json({ok:true}));
 app.post('/api/orcamentos-dossiers/extract',(req,res,next)=>req.headers.authorization==='Bearer synthetic' ? next() : res.status(401).end(),dossierBodyParser,(req,res)=>res.json({size:req.body.pdf.length}));
 app.use(errorHandler);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const post=(path,body,headers={})=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body});
 try{
  const large=JSON.stringify({pdf:'a'.repeat(3*1024*1024)});
  await t.test('ordinary JSON over 2 MiB returns 413',async()=>assert.equal((await post('/api/example',large)).status,413));
  await t.test('unauthenticated dossier is rejected before parsing invalid JSON',async()=>assert.equal((await post('/api/orcamentos-dossiers/extract','not-json')).status,401));
  await t.test('authorized large dossier retains its existing capacity',async()=>assert.equal((await (await post('/api/orcamentos-dossiers/extract',large,{Authorization:'Bearer synthetic'})).json()).size,3*1024*1024));
  await t.test('signature verification retains untouched raw body',async()=>assert.equal((await (await post('/signed-webhook','{}')).json()).raw,true));
 }finally{await new Promise(r=>server.close(r));}
});
test('central errors exclude secrets, body and query parameters from logs and response',()=>{
 const warn=mock.method(console,'error',()=>{});let payload;
 const req={headers:{},originalUrl:'/api/example?token=synthetic-secret',method:'POST'};
 const res={setHeader(){},status(){return this;},json(value){payload=value;return this;}};
 requestContext(req,res,()=>{});errorHandler(new Error('postgres://user:synthetic-secret@host'),req,res,()=>{});
 assert.equal(getRequestMeta(req).path,'/api/example');
 assert.ok(!JSON.stringify(warn.mock.calls).includes('synthetic-secret'));
 assert.ok(!JSON.stringify(payload).includes('synthetic-secret'));
 warn.mock.restore();
});
