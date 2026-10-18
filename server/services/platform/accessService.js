import { createSupabaseUserClient, supabaseAdminClient } from '../../lib/supabaseClients.js';
import { AppError } from '../../middleware/errorHandler.js';

export function rpcError(error) {
  const denied = error?.code === '42501';
  if (['40001','40P01','55P03'].includes(error?.code)) return new AppError('BATCH_CONFLICT','Operação concorrente ou lote fora de ordem. Repita o lote atual.',{status:409});
  if(error?.code === '23505') return new AppError('CONFLICT','Já existe um registo com este identificador.',{status:409});
  const invalid = ['22023','22P02','23503','23514','23502'].includes(error?.code);
  return new AppError(denied ? 'FORBIDDEN' : invalid ? 'VALIDATION_ERROR' : 'SERVICE_UNAVAILABLE',
    denied ? 'Sem autorização para esta operação.' : invalid ? 'Dados inválidos ou dependências de módulos em falta.' : 'Não foi possível verificar as permissões. Tente novamente.',
    { status: denied ? 403 : invalid ? 400 : error?.code === '23505' ? 409 : 503 });
}
const requestClient = Symbol('platformUserClient');
export async function userRpc(req, name, args = {}) {
  const client = req[requestClient] || (req[requestClient] = createSupabaseUserClient(req.accessToken));
  if (!client) throw new AppError('SERVICE_UNAVAILABLE','Serviço de permissões indisponível.',{status:503});
  const { data, error } = await client.rpc(name,args);
  if(error) throw rpcError(error);
  return data;
}
export function requirePermission(permission) {
  return async (req,_res,next) => {
    try {
      // No platform-admin bypass for ordinary tenant operations.
      if (!req.organizationId) throw new AppError('TENANT_REQUIRED','Selecione uma organização autorizada.');
      const allowed=await userRpc(req,'platform_permission',{p_org:req.organizationId,p_permission:permission,p_store:req.storeId||null});
      if(allowed !== true) throw new AppError('FORBIDDEN','Esta funcionalidade não está disponível para o seu acesso.');
      next();
    } catch(error){next(error);}
  };
}
export async function requireEventAccess(req,event) {
  if(!event?.organization_id || event.organization_id!==req.organizationId) return false;
  return (await userRpc(req,'platform_row_access',{p_org:event.organization_id,p_store:event.store||null,p_permission:'reports.read'})) === true;
}
export async function systemModuleEnabled(organizationId,moduleKey,storeName=null) {
  if(!organizationId || !supabaseAdminClient) return false;
  const {data,error}=await supabaseAdminClient.rpc('platform_system_module',{p_org:organizationId,p_store:storeName,p_module:moduleKey});
  if(error) throw rpcError(error);
  return data===true;
}

export async function systemStoreEmail(organizationId,storeName) {
  if (!organizationId || !supabaseAdminClient) return "";
  const {data,error}=await supabaseAdminClient.from("stores").select("name,code,email").eq("organization_id",organizationId).eq("status","active");
  if(error) throw rpcError(error);
  const normalized=String(storeName||"").trim().toLowerCase();
  const matches=(data||[]).filter(store=>[store.name,store.code].some(value=>String(value||"").trim().toLowerCase()===normalized));
  return matches.length===1 ? String(matches[0].email||"").trim() : "";
}
