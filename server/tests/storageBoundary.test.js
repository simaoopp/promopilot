import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
let isPublic=false, paths=[];
await mock.module('../lib/supabaseClients.js',{namedExports:{hasSupabaseAdminConfig:()=>true,supabaseAdminClient:{storage:{
 getBucket:async()=>({data:{public:isPublic}}),
 from:()=>({async upload(path){paths.push(path);return {};},async createSignedUrl(){return {data:{signedUrl:'https://storage.example.test/synthetic'}};}}),
}}}});
const {uploadAutomaticCampaignPdf}=await import('../services/automatic-campaigns/storageService.js');
const input={pdfBuffer:Buffer.from('%PDF-QA'),emailMessageId:'synthetic',storeKey:'qa',title:'Synthetic',organizationId:'20000000-0000-4000-8000-000000000001'};
test('PDF uploads require explicit ownership and a private bucket',async()=>{
 await assert.rejects(uploadAutomaticCampaignPdf({...input,organizationId:''}),/Organização/);assert.equal(paths.length,0);
 isPublic=true;await assert.rejects(uploadAutomaticCampaignPdf(input),/privado/);assert.equal(paths.length,0);
 isPublic=false;const result=await uploadAutomaticCampaignPdf(input);assert.ok(result.path.startsWith(input.organizationId+'/'));assert.equal(paths.length,1);
});
