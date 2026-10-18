import { loadAccess } from './platformService';
import { supabase } from '../lib/supabase';
jest.mock('../lib/supabase',()=>({supabase:{auth:{getSession:jest.fn()}}}));
beforeEach(()=>{
 supabase.auth.getSession.mockResolvedValue({data:{session:{access_token:'synthetic-test-token'}}});
 global.fetch=jest.fn();
});
afterEach(()=>{delete global.fetch;});
test('access 404 explains deployment issue and never falls back to permissive access',async()=>{
 fetch.mockResolvedValue({status:404,ok:false,json:async()=>({ok:false,error:{message:'Recurso não encontrado.'}})});
 await expect(loadAccess()).rejects.toMatchObject({code:'ACCESS_API_NOT_DEPLOYED',status:404});
 expect(fetch).toHaveBeenCalledTimes(1);
});
test('HTML fallback and incomplete access payload are rejected',async()=>{
 fetch.mockResolvedValueOnce({status:200,ok:true,json:async()=>{throw new Error('HTML');}});
 await expect(loadAccess()).rejects.toThrow('resposta válida');
 fetch.mockResolvedValueOnce({status:200,ok:true,json:async()=>({ok:true,context:{platformAdmin:true}})});
 await expect(loadAccess()).rejects.toThrow('incompatível');
});
test('valid context remains unchanged',async()=>{
 const context={platformAdmin:false,organizations:[],stores:[],permissions:{'products.read':false}};
 fetch.mockResolvedValue({status:200,ok:true,json:async()=>({ok:true,context})});
 await expect(loadAccess()).resolves.toEqual(context);
});
