import { platformRequest } from "./platformService";
import { supabase } from "../lib/supabase";
import { SESSION_EXPIRED_EVENT } from "../utils/supabaseAuthRecovery";
jest.mock("../lib/supabase", () => ({ authStorageKey:"sb-test-auth-token", supabase:{auth:{getSession:jest.fn(),refreshSession:jest.fn(),signOut:jest.fn()}} }));
const session = (token="old", id="a") => ({access_token:token,user:{id}});
const answer = (status, payload={ok:true}) => ({status,ok:status<400,json:async()=>payload,body:{cancel:jest.fn()}});
beforeEach(()=>{
 jest.clearAllMocks(); localStorage.clear(); global.fetch=jest.fn();
 supabase.auth.getSession.mockResolvedValue({data:{session:session()}});
 supabase.auth.refreshSession.mockResolvedValue({data:{session:session("new")}});
});
afterEach(()=>{delete global.fetch; jest.useRealTimers();});
test("a 401 refreshes through the SDK once then retries with the new token", async()=>{
 fetch.mockResolvedValueOnce(answer(401)).mockResolvedValueOnce(answer(200));
 await expect(platformRequest("/api/access")).resolves.toEqual({ok:true});
 expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
 expect(fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer new");
});
test("a second 401 is a finite API error, never an infinite refresh or logout",async()=>{
 fetch.mockResolvedValue(answer(401));
 await expect(platformRequest("/api/access")).rejects.toMatchObject({code:"API_SESSION_REJECTED"});
 expect(fetch).toHaveBeenCalledTimes(2); expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
 expect(supabase.auth.signOut).not.toHaveBeenCalled();
});
test.each([403,500,503,429])("HTTP %s never refreshes or logs out a valid user",async status=>{
 fetch.mockResolvedValue(answer(status,{error:{message:"secret SQL token"}}));
 await expect(platformRequest("/api/access")).rejects.toMatchObject({kind:status===403?"permission_error":"network_error"});
 expect(supabase.auth.refreshSession).not.toHaveBeenCalled(); expect(supabase.auth.signOut).not.toHaveBeenCalled();
});
test("a token rotated in another tab is reused without another rotation",async()=>{
 supabase.auth.getSession.mockResolvedValueOnce({data:{session:session()}}).mockResolvedValue({data:{session:session("tab-new")}});
 fetch.mockResolvedValueOnce(answer(401)).mockResolvedValue(answer(200));
 await platformRequest("/api/access");
 expect(supabase.auth.refreshSession).not.toHaveBeenCalled(); expect(fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer tab-new");
});
test("a request is never replayed with another user's session",async()=>{
 supabase.auth.getSession.mockResolvedValueOnce({data:{session:session()}}).mockResolvedValue({data:{session:session("other-token","b")}});
 fetch.mockResolvedValue(answer(401));
 await expect(platformRequest("/api/access")).rejects.toMatchObject({code:"SESSION_CHANGED"}); expect(fetch).toHaveBeenCalledTimes(1);
});
test("concurrent 401s share one in-flight SDK refresh",async()=>{
 let resolve; supabase.auth.refreshSession.mockReturnValue(new Promise(done=>{resolve=done;}));
 fetch.mockImplementation(async(_url,options)=>answer(options.headers.Authorization==="Bearer new"?200:401));
 const a=platformRequest("/api/access"); const b=platformRequest("/api/access");
 for(let i=0;i<30;i++) await Promise.resolve();
 expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
 resolve({data:{session:session("new")}}); await Promise.all([a,b]);
 expect(fetch).toHaveBeenCalledTimes(4);
});
test("a definitively invalid refresh ends the local session and preserves unrelated storage",async()=>{
 const expired=jest.fn(); window.addEventListener(SESSION_EXPIRED_EVENT,expired);
 localStorage.setItem("sb-other-auth-token","keep");
 supabase.auth.getSession.mockResolvedValueOnce({data:{session:session()}}).mockResolvedValueOnce({data:{session:session()}}).mockResolvedValue({data:{session:null}});
 supabase.auth.refreshSession.mockResolvedValue({error:{code:"refresh_token_not_found"}});
 fetch.mockResolvedValue(answer(401));
 await expect(platformRequest("/api/access")).rejects.toMatchObject({code:"SESSION_EXPIRED"});
 expect(expired).toHaveBeenCalledTimes(1); expect(localStorage.getItem("sb-other-auth-token")).toBe("keep");
 expect(fetch).toHaveBeenCalledTimes(1); window.removeEventListener(SESSION_EXPIRED_EVENT,expired);
});
test("aborted requests cannot proceed while session lookup is pending",async()=>{
 const controller=new AbortController(); controller.abort();
 await expect(platformRequest("/api/access",{signal:controller.signal})).rejects.toMatchObject({name:"AbortError"});
 expect(fetch).not.toHaveBeenCalled();
});
test("mutations are not automatically replayed",async()=>{
 fetch.mockResolvedValue(answer(401));
 await expect(platformRequest("/api/access/context",{method:"POST",body:{organizationId:"a"}})).rejects.toMatchObject({code:"API_SESSION_REJECTED"});
 expect(fetch).toHaveBeenCalledTimes(1); expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
});
test("a hung response has a deadline even if a transport ignores abort",async()=>{
 jest.useFakeTimers(); fetch.mockReturnValue(new Promise(()=>{}));
 const request=platformRequest("/api/access"); const expected=expect(request).rejects.toMatchObject({kind:"network_error"});
 for(let i=0;i<10;i++) await Promise.resolve(); jest.advanceTimersByTime(20000); await expected;
 expect(supabase.auth.signOut).not.toHaveBeenCalled();
});

test("a missing SDK session signals expiry instead of leaving a stale logged-in UI",async()=>{
 const expired=jest.fn();window.addEventListener(SESSION_EXPIRED_EVENT,expired);
 supabase.auth.getSession.mockResolvedValue({data:{session:null}});
 await expect(platformRequest("/api/access")).rejects.toMatchObject({code:"SESSION_EXPIRED"});
 expect(expired).toHaveBeenCalledTimes(1);expect(fetch).not.toHaveBeenCalled();window.removeEventListener(SESSION_EXPIRED_EVENT,expired);
});
