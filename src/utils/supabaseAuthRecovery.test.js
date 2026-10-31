import { isSupabaseRefreshTokenError, recoverFromInvalidSupabaseSession, SESSION_EXPIRED_EVENT } from "./supabaseAuthRecovery";
jest.mock("../lib/supabase",()=>({authStorageKey:"sb-example-auth-token"}));
beforeEach(()=>localStorage.clear());
test("recovery delegates cleanup to the SDK and never deletes another project's auth/preferences",async()=>{
 localStorage.setItem("sb-other-auth-token","other-session");localStorage.setItem("supplier-template","keep");
 const remove=jest.spyOn(Storage.prototype,"removeItem");
 const client={auth:{getSession:jest.fn().mockResolvedValue({data:{session:null}}),signOut:jest.fn()}};
 await expect(recoverFromInvalidSupabaseSession(client)).resolves.toBe(true);
 expect(remove).not.toHaveBeenCalled();expect(client.auth.signOut).not.toHaveBeenCalled();
 expect(localStorage.getItem("sb-other-auth-token")).toBe("other-session");expect(localStorage.getItem("supplier-template")).toBe("keep");remove.mockRestore();
});
test("structured invalid refresh codes are recognized",()=>{
 expect(isSupabaseRefreshTokenError({code:"refresh_token_not_found",message:"Localized failure"})).toBe(true);
});
test("a session established in another tab is preserved",async()=>{
 const client={auth:{getSession:jest.fn().mockResolvedValue({data:{session:{access_token:"new"}}}),signOut:jest.fn()}};
 await expect(recoverFromInvalidSupabaseSession(client)).resolves.toBe(false);expect(client.auth.signOut).not.toHaveBeenCalled();
});
test("a new storage write arriving while recovery awaits the SDK cancels the expiry event",async()=>{
 let finish;const client={auth:{getSession:()=>new Promise(resolve=>{finish=resolve;})}};
 const expired=jest.fn();window.addEventListener(SESSION_EXPIRED_EVENT,expired);
 const operation=recoverFromInvalidSupabaseSession(client);
 localStorage.setItem("sb-example-auth-token","new-session");finish({data:{session:null}});
 await expect(operation).resolves.toBe(false);expect(expired).not.toHaveBeenCalled();expect(localStorage.getItem("sb-example-auth-token")).toBe("new-session");
 window.removeEventListener(SESSION_EXPIRED_EVENT,expired);
});
test("restricted localStorage does not crash recovery",async()=>{
 const spy=jest.spyOn(Storage.prototype,"getItem").mockImplementation(()=>{throw new Error("blocked");});
 const client={auth:{getSession:async()=>({data:{session:null}})}};
 await expect(recoverFromInvalidSupabaseSession(client)).resolves.toBe(true);spy.mockRestore();
});
test("a temporary verification error does not end the session",async()=>{
 const expired=jest.fn();window.addEventListener(SESSION_EXPIRED_EVENT,expired);
 const client={auth:{getSession:async()=>({error:{name:"AuthRetryableFetchError"}})}};
 await expect(recoverFromInvalidSupabaseSession(client)).rejects.toMatchObject({name:"AuthRetryableFetchError"});expect(expired).not.toHaveBeenCalled();window.removeEventListener(SESSION_EXPIRED_EVENT,expired);
});
