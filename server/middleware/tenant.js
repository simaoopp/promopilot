import { userRpc } from '../services/platform/accessService.js';
import { AppError } from './errorHandler.js';
export function normalizeUuid(value='') {
  const text=String(value||'').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)?text:'';
}
export async function attachTenantContext(req,_res,next) {
 try {
  const orgInput=req.headers['x-organization-id']||req.query?.organizationId||req.body?.organization_id||req.body?.organizationId;
  const storeInput=req.headers['x-store-id'];
  if((orgInput&&!normalizeUuid(orgInput))||(storeInput&&!normalizeUuid(storeInput)))throw new AppError('VALIDATION_ERROR','Organização ou loja inválida.');
  const includePermissions = req.method === 'GET' && req.path === '/api/access';
  const context=await userRpc(req,'platform_access_context',{p_organization_id:orgInput||null,p_store_id:storeInput||null,p_include_permissions:includePermissions});
  if (!context || !Array.isArray(context.organizations) || !Array.isArray(context.stores)) throw new AppError('SERVICE_UNAVAILABLE','Contexto de acesso inválido.',{status:503});
  req.permissionContextComplete = includePermissions;
  req.permissionContext=context;
  req.organizationId=context.organizationId;
  req.organizationRole=context.role;
  req.storeId=context.storeId;
  req.organizationStoreId=context.storeId;
  req.isAdmin=context.platformAdmin===true;
  req.memberships=context.organizations.map(o=>({organization_id:o.id,status:'active'}));
  const stores=context.stores.filter(s=>s.status==='active'&&(!context.storeId||s.id===context.storeId));
  Object.assign(req.auth,{isAdmin:req.isAdmin,isPlatformAdmin:req.isAdmin,organizationId:req.organizationId,organizationRole:context.role,
    isOrgAdmin:['owner','admin'].includes(context.role),store:stores.find(s=>s.id===context.storeId)?.name||'',allowedStores:stores.map(s=>s.name)});
  next();
 }catch(error){next(error);}
}
export function requireOrganization(req,_res,next){return req.organizationId?next():next(new AppError('TENANT_REQUIRED','Organização obrigatória.'));}
export function requireOrganizationRole(roles=[]){return(req,_res,next)=>req.organizationId&&roles.includes(req.organizationRole)?next():next(new AppError('FORBIDDEN','Sem permissões nesta organização.'));}
