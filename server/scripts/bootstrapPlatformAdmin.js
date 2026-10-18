import 'dotenv/config';
import { supabaseAdminClient } from '../lib/supabaseClients.js';
const email=process.argv.find(x=>x.startsWith('--email='))?.slice(8)?.trim();
if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !supabaseAdminClient) {
 console.error('Utilização: node scripts/bootstrapPlatformAdmin.js --email=CONTA_VERIFICADA. Configurar SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY apenas no servidor.');process.exitCode=1;
} else {
 const {data,error}=await supabaseAdminClient.rpc('bootstrap_platform_admin',{p_email:email});
 if(error){console.error('Atribuição recusada:',error.message);process.exitCode=1;}
 else console.log(JSON.stringify({ok:true,userId:data,message:'Primeiro CEO atribuído e auditado.'}));
}
