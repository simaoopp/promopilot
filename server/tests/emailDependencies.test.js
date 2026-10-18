import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { ImapFlow } from 'imapflow';
let options;
await mock.module('nodemailer',{defaultExport:{createTransport(config){options=config;return nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'});}}});
await mock.module('../services/automatic-campaigns/config.js',{namedExports:{
 getAutomaticCampaignConfig:()=>({emailProvider:'smtp',smtp:{host:'smtp.example.test',port:587,secure:false,requireTLS:true,from:'QA <qa@example.test>',fallbackEnabled:false}}),
 hasEmailApiConfig:()=>false,hasSmtpConfig:()=>true,
}});
const {sendAutomaticCampaignEmail}=await import('../services/automatic-campaigns/emailSenderService.js');
test('updated mail dependencies preserve the real campaign template, Unicode and PDF attachment without network sending',async()=>{
 const pdf=Buffer.from('%PDF-synthetic-qa');
 const result=await sendAutomaticCampaignEmail({to:'recipient@example.test',storeLabel:'Loja Sintética',pdfBuffer:pdf,filename:'etiquetas-qa.pdf',totalItems:2,subject:'Campanha sintética',pvpUpdateCodes:['QA-1']});
 assert.equal(result.provider,'smtp');assert.equal(options.requireTLS,true);assert.equal(options.tls.minVersion,'TLSv1.2');
 const parsed=await simpleParser(result.message);
 assert.equal(parsed.to.value[0].address,'recipient@example.test');assert.ok(parsed.subject.includes('Sintética'));
 assert.ok(parsed.html.includes('QA-1'));assert.equal(parsed.attachments.length,1);assert.deepEqual(parsed.attachments[0].content,pdf);
});
test('IMAP constructor accepts the existing TLS configuration without establishing a connection',()=>{
 const client=new ImapFlow({host:'imap.example.test',port:993,secure:true,auth:{user:'qa@example.test',pass:'synthetic'},logger:false});
 assert.equal(typeof client.connect,'function');assert.equal(typeof client.fetch,'function');assert.equal(typeof client.logout,'function');
});
