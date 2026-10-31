import React, {act} from "react";
import {createRoot} from "react-dom/client";
import {PermissionProvider,usePermissions} from "./PermissionContext";
import {useAuth} from "./AuthContext";
import {loadAccess,setPermissionSnapshot} from "../services/platformService";
import {authIssue} from "../utils/authErrors";
jest.mock("./AuthContext",()=>({useAuth:jest.fn()}));
jest.mock("../services/platformService",()=>({loadAccess:jest.fn(),setPermissionSnapshot:jest.fn()}));
let root,host,state,auth;
const context=(org="org-a")=>({organizationId:org,organizations:[{id:org},{id:"org-b"}],stores:[],pages:[{page_key:"home"}],permissions:{"products.read":true}});
function Probe(){state=usePermissions();return <p>{state.context?.organizationId}</p>;}
beforeEach(()=>{
 jest.clearAllMocks(); jest.useFakeTimers(); global.IS_REACT_ACT_ENVIRONMENT=true;
 jest.spyOn(console,"warn").mockImplementation(()=>{});
 auth={user:{id:"a"},authStatus:"authenticated",loadingProfile:false,profileError:"",updateAccessContext:jest.fn()};
 useAuth.mockImplementation(()=>auth);loadAccess.mockResolvedValue(context());
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.useRealTimers();jest.restoreAllMocks();});
async function render(){await act(async()=>root.render(<PermissionProvider><Probe/></PermissionProvider>));}
test("protected API waits for auth and profile readiness",async()=>{
 auth.authStatus="initializing";await render();expect(loadAccess).not.toHaveBeenCalled();
 auth.authStatus="authenticated";auth.loadingProfile=true;await render();expect(loadAccess).not.toHaveBeenCalled();
 auth.loadingProfile=false;await render();expect(loadAccess).toHaveBeenCalledTimes(1);expect(state.hasPage("home")).toBe(true);
});
test("a 403 denies permissions while the identity remains authenticated",async()=>{
 loadAccess.mockRejectedValue(authIssue("PERMISSION_DENIED",403));await render();
 expect(state.status).toBe("permission_error");expect(state.can("products.read")).toBe(false);
 expect(auth.user.id).toBe("a");expect(auth.authStatus).toBe("authenticated");
});
test("a temporary API outage can retry with the same login",async()=>{
 loadAccess.mockRejectedValueOnce(authIssue("NETWORK_ERROR",503));await render();
 expect(state.status).toBe("network_error");expect(state.loading).toBe(false);
 await act(async()=>state.refresh());expect(state.context.organizationId).toBe("org-a");expect(auth.user.id).toBe("a");
});
test("a user without organizations never receives default permissions",async()=>{
 loadAccess.mockResolvedValue({organizationId:null,organizations:[],stores:[],pages:[],permissions:{}});await render();
 expect(state.loading).toBe(false);expect(state.can("products.read")).toBe(false);expect(state.hasPage("home")).toBe(false);
});
test("a late permission response from a previous login is discarded",async()=>{
 let resolve;loadAccess.mockReturnValueOnce(new Promise(done=>{resolve=done;}));await render();
 auth={...auth,user:{id:"b"}};loadAccess.mockResolvedValue(context("org-b"));await render();
 await act(async()=>resolve(context("org-a")));expect(state.context.organizationId).toBe("org-b");
 expect(setPermissionSnapshot).toHaveBeenLastCalledWith({...context("org-b"),userId:"b"});
});
test("background permission revocation fails closed without expiring Auth",async()=>{
 await render();loadAccess.mockRejectedValue(authIssue("PERMISSION_DENIED",403));
 await act(async()=>state.refresh());expect(state.can("products.read")).toBe(false);expect(auth.authStatus).toBe("authenticated");
});
test("multiple organizations are retained exactly as authorized by the server",async()=>{
 await render();expect(state.context.organizations).toEqual(context().organizations);
 expect(auth.updateAccessContext).toHaveBeenCalledWith("a",context());
});
