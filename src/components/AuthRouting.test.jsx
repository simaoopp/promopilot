import React, {act} from "react";
import {createRoot} from "react-dom/client";
import {MemoryRouter,Routes,Route,useLocation,Link} from "react-router-dom";
import {AuthProvider} from "../context/AuthContext";
import {PermissionProvider} from "../context/PermissionContext";
import {supabase} from "../lib/supabase";
import {getProfile} from "../services/profileService";
import {loadAccess} from "../services/platformService";
import ProtectedRoute from "./ProtectedRoute";
import FeatureRoute from "./FeatureRoute";
import Login from "../pages/Login";
jest.mock("../lib/supabase",()=>({supabase:{auth:{getSession:jest.fn(),onAuthStateChange:jest.fn(),signOut:jest.fn(),signInWithPassword:jest.fn()}}}));
jest.mock("../services/profileService",()=>({getProfile:jest.fn()}));
jest.mock("../services/platformService",()=>({loadAccess:jest.fn(),setPermissionSnapshot:jest.fn(),selectAccess:jest.fn()}));
jest.mock("./ForcePasswordChangeModal",()=>()=>"Completar perfil");
jest.mock("./PasswordRecoveryModal",()=>()=>"Recuperar palavra-passe");
let host,root,notify,pathname;
const session={user:{id:"qa"},access_token:"fake"};
function Location(){pathname=useLocation().pathname;return null;}
const fullAccess={organizationId:"org-a",organizations:[{id:"org-a",name:"QA A"},{id:"org-b",name:"QA B"}],stores:[],permissions:{},pages:[{page_key:"home"},{page_key:"other"}]};
beforeEach(()=>{
 jest.clearAllMocks();jest.useFakeTimers();global.IS_REACT_ACT_ENVIRONMENT=true;
 jest.spyOn(console,"warn").mockImplementation(()=>{});
 supabase.auth.getSession.mockResolvedValue({data:{session}});
 supabase.auth.onAuthStateChange.mockImplementation(fn=>{notify=fn;return {data:{subscription:{unsubscribe:jest.fn()}}};});
 getProfile.mockResolvedValue({id:"qa",first_name:"QA",last_name:"User",must_change_password:false});loadAccess.mockResolvedValue(fullAccess);
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.useRealTimers();jest.restoreAllMocks();});
async function mount(path="/Homepage") {
 await act(async()=>root.render(<MemoryRouter initialEntries={[path]} future={{v7_startTransition:true,v7_relativeSplatPath:true}}><AuthProvider><PermissionProvider><Location/><Routes>
  <Route path="/login" element={<Login/>}/>
  <Route path="/Homepage" element={<ProtectedRoute><FeatureRoute page="home"><p>Homepage pronta</p><Link to="/other">Seguinte</Link></FeatureRoute></ProtectedRoute>}/>
  <Route path="/other" element={<ProtectedRoute><FeatureRoute page="other"><p>Outra página protegida</p></FeatureRoute></ProtectedRoute>}/>
 </Routes></PermissionProvider></AuthProvider></MemoryRouter>));
 await act(async()=>jest.advanceTimersByTime(0));
}
test("direct homepage access without a session redirects once to login",async()=>{
 supabase.auth.getSession.mockResolvedValue({data:{session:null}});await mount();
 expect(pathname).toBe("/login");expect(host.textContent).toContain("Bem-vindo");expect(loadAccess).not.toHaveBeenCalled();
});
test("a restored session opens the homepage only after permissions finish",async()=>{
 let resolve;loadAccess.mockReturnValue(new Promise(done=>{resolve=done;}));await mount();
 expect(host.textContent).toContain("A verificar permissões");expect(host.textContent).not.toContain("Homepage pronta");
 await act(async()=>resolve(fullAccess));expect(host.textContent).toContain("Homepage pronta");expect(pathname).toBe("/Homepage");
});
test("a valid login route redirects to homepage without a loop",async()=>{
 await mount("/login");expect(pathname).toBe("/Homepage");expect(host.textContent).toContain("Homepage pronta");
 await act(async()=>jest.advanceTimersByTime(0));expect(pathname).toBe("/Homepage");
});
test("initialization network error offers retry and does not falsely redirect to login",async()=>{
 supabase.auth.getSession.mockRejectedValue(new TypeError("fetch failed"));await mount();
 expect(pathname).toBe("/Homepage");expect(host.textContent).toContain("Ligação temporariamente indisponível");
 supabase.auth.getSession.mockResolvedValue({data:{session}});
 await act(async()=>host.querySelector("button").click());await act(async()=>jest.advanceTimersByTime(0));
 expect(host.textContent).toContain("Homepage pronta");
});
test("an authenticated user without organizations receives access guidance, not a login error",async()=>{
 loadAccess.mockResolvedValue({...fullAccess,organizationId:null,organizations:[],pages:[]});await mount();
 expect(pathname).toBe("/Homepage");expect(host.textContent).toContain("A tua conta está autenticada");expect(host.textContent).not.toContain("Completar perfil");
});
test("insufficient permission preserves the login and offers only authorized organizations",async()=>{
 loadAccess.mockResolvedValue({...fullAccess,pages:[]});await mount();
 expect(host.textContent).toContain("Esta área não está disponível");expect(host.textContent).toContain("QA A");expect(host.textContent).toContain("QA B");
 expect(pathname).toBe("/Homepage");
});
test("navigation between protected pages preserves the authenticated identity",async()=>{
 await mount();await act(async()=>host.querySelector('a').dispatchEvent(new MouseEvent("click",{bubbles:true,button:0,cancelable:true})));
 expect(pathname).toBe("/other");expect(host.textContent).toContain("Outra página protegida");expect(supabase.auth.getSession).toHaveBeenCalledTimes(1);
});
test("a signout event from another tab unmounts protected content",async()=>{
 await mount();await act(async()=>notify("SIGNED_OUT",null));
 expect(pathname).toBe("/login");expect(host.textContent).toContain("sessão expirou");expect(host.textContent).not.toContain("Homepage pronta");
});
test("mandatory password change still blocks protected routes",async()=>{
 getProfile.mockResolvedValue({id:"qa",first_name:"QA",last_name:"User",must_change_password:true});await mount();
 expect(pathname).toBe("/login");expect(host.textContent).toContain("Completar perfil");expect(host.textContent).not.toContain("Homepage pronta");
});
async function fillCredentials() {
 await act(async()=>{
  for(const [selector,value] of [["#email","qa@example.test"],["#senha","synthetic-password"]]) {
   const input=host.querySelector(selector);
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,value);
   input.dispatchEvent(new Event("input",{bubbles:true}));
  }
 });
}
async function submitLogin(){await act(async()=>host.querySelector("form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));}
test("the real login form submits credentials then opens the protected homepage",async()=>{
 supabase.auth.getSession.mockResolvedValue({data:{session:null}});
 supabase.auth.signInWithPassword.mockResolvedValue({data:{session}});await mount("/login");await fillCredentials();await submitLogin();
 await act(async()=>jest.advanceTimersByTime(0));
 expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({email:"qa@example.test",password:"synthetic-password"});
 expect(pathname).toBe("/Homepage");expect(host.textContent).toContain("Homepage pronta");
});
test("the real login form distinguishes bad credentials from network errors",async()=>{
 supabase.auth.getSession.mockResolvedValue({data:{session:null}});
 supabase.auth.signInWithPassword.mockResolvedValue({error:{code:"invalid_credentials"}});await mount("/login");await fillCredentials();await submitLogin();
 expect(host.textContent).toContain("Email ou palavra-passe inválidos");
 supabase.auth.signInWithPassword.mockRejectedValue(new TypeError("fetch failed"));await submitLogin();
 expect(host.textContent).toContain("Não foi possível estabelecer ligação");expect(host.textContent).not.toContain("Email ou palavra-passe inválidos");
});
