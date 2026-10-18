import express from 'express';

const dossierPath = /^\/api\/orcamentos-dossiers\/(extract|generate)\/?$/i;
// Large PDF payloads are parsed only AFTER auth, tenant and module checks.
export const dossierBodyParser = express.json({limit: process.env.DOSSIER_JSON_BODY_LIMIT || '80mb'});
export function installBodyParsers(app) {
  const json = express.json({limit: process.env.JSON_BODY_LIMIT || '2mb'});
  app.use((req,res,next)=>req.method==='POST' && dossierPath.test(req.path) ? next() : json(req,res,next));
  app.use(express.urlencoded({extended:false,limit:process.env.URLENCODED_BODY_LIMIT || '64kb'}));
}
