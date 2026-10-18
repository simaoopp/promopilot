import { userRpc } from '../services/platform/accessService.js';
import { adminActionRateLimit } from '../middleware/security.js';
import { AppError } from '../middleware/errorHandler.js';
const RESOURCES=new Set(['dashboard','organizations','organization','stores','users','audit','catalog','permissions','settings']);
export function registerPlatformRoutes(app,{authStack,requireAdmin}) {
 app.get('/api/access',...authStack,async(req,res,next)=>{
  try { const context=req.permissionContextComplete ? req.permissionContext : await userRpc(req,'platform_access_context',{p_organization_id:req.organizationId||null,p_store_id:req.storeId||null});res.set('Cache-Control','no-store').json({ok:true,context}); }catch(error){next(error);}
 });
 app.post('/api/access/context',...authStack,async(req,res,next)=>{
  try { const context=await userRpc(req,'platform_select_context',{p_organization_id:req.body?.organizationId,p_store_id:req.body?.storeId||null});res.set('Cache-Control','no-store').json({ok:true,context}); }catch(e){next(e);}
 });
 app.get('/api/ceo/:resource',...authStack,requireAdmin,async(req,res,next)=>{
  try {
   if(!RESOURCES.has(req.params.resource))throw new AppError('NOT_FOUND','Recurso desconhecido.');
   const data=await userRpc(req,'platform_admin_read',{p_resource:req.params.resource,p_status:req.query.status||null,p_organization_id:req.query.org||null,
    p_query:String(req.query.q||'').slice(0,160),p_limit:50,p_offset:Math.max(0,parseInt(req.query.offset,10)||0)});
   res.set('Cache-Control','no-store').json({ok:true,data});
  }catch(e){next(e);}
 });
 app.post('/api/ceo/change',...authStack,requireAdmin,adminActionRateLimit,async(req,res,next)=>{
  try {if(JSON.stringify(req.body).length>32768)throw new AppError('VALIDATION_ERROR','Pedido demasiado grande.');
   const data=await userRpc(req,'platform_admin_mutate',{p_entity:req.body?.entity,p_data:req.body?.data||{}});
   res.set('Cache-Control','no-store').json({ok:true,data});
  }catch(e){next(e);}
 });
}
