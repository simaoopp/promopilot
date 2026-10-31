import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider, useAuth } from "./AuthContext";
import { supabase } from "../lib/supabase";
import { getProfile } from "../services/profileService";

jest.mock("../lib/supabase", () => ({ initialStoredSession: false, supabase: { auth: {
  getSession: jest.fn(), onAuthStateChange: jest.fn(), signOut: jest.fn(), signInWithPassword: jest.fn(), refreshSession: jest.fn(),
} } }));
jest.mock("../services/profileService", () => ({ getProfile: jest.fn(), upsertProfile: jest.fn() }));
let root, host, state, notify;
const session = id => ({ user: { id }, access_token: `test-${id}`, refresh_token: `refresh-${id}` });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function Probe() { state = useAuth(); return <p>{state.profile?.first_name}</p>; }
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  require("../lib/supabase").initialStoredSession = false;
  jest.spyOn(console, "warn").mockImplementation(() => {}); global.IS_REACT_ACT_ENVIRONMENT = true;
  supabase.auth.getSession.mockResolvedValue({ data: { session: session("a") } });
  supabase.auth.signOut.mockResolvedValue({ error: null });
  supabase.auth.onAuthStateChange.mockImplementation(fn => { notify = fn; return { data: { subscription: { unsubscribe: jest.fn() } } }; });
  getProfile.mockResolvedValue({ first_name: "QA", last_name: "User", must_change_password: false });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); jest.useRealTimers(); jest.restoreAllMocks(); });
async function mount() { await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>)); }
async function tick() { await act(async () => jest.advanceTimersByTime(0)); }
test("a late profile cannot restore data after logout", async () => {
  const pending = deferred(); getProfile.mockReturnValue(pending.promise);
  await mount(); await tick();
  await act(async () => notify("SIGNED_OUT", null));
  await act(async () => pending.resolve({ first_name: "Old account" }));
  expect(state.user).toBeNull(); expect(state.profile).toBeNull(); expect(host.textContent).toBe("");
});
test("switching accounts clears previous profile and ignores late results", async () => {
  const a = deferred(); getProfile.mockImplementation(id => id === "a" ? a.promise : Promise.resolve({ first_name: "New account" }));
  await mount(); await tick();
  await act(async () => notify("SIGNED_IN", session("b"))); await tick();
  await act(async () => a.resolve({ first_name: "Old account" }));
  expect(state.user.id).toBe("b"); expect(state.profile.first_name).toBe("New account");
});
test("profile requests leave the synchronous auth callback before calling Supabase", async () => {
  getProfile.mockResolvedValue(null); await mount(); await tick(); getProfile.mockClear();
  await act(async () => { notify("SIGNED_IN", session("b")); expect(getProfile).not.toHaveBeenCalled(); });
  await tick(); expect(getProfile).toHaveBeenCalledWith("b");
});
test("profile failure offers retry without treating an outage as onboarding", async () => {
  getProfile.mockRejectedValueOnce(new Error("transport failure")); await mount(); await tick();
  expect(state.profileError).toContain("Tenta novamente"); expect(state.onboardingRequired).toBe(false);
  getProfile.mockResolvedValue({ first_name: "QA", last_name: "User", store: "Synthetic", must_change_password: false });
  await act(async () => state.refreshProfile()); expect(state.profileError).toBe(""); expect(state.profile.first_name).toBe("QA");
});
test("initial session response cannot undo a newer logout event", async () => {
  const pending = deferred(); supabase.auth.getSession.mockReturnValue(pending.promise); await mount();
  await act(async () => notify("SIGNED_OUT", null));
  await act(async () => pending.resolve({ data: { session: session("a") } })); await tick();
  expect(state.user).toBeNull(); expect(getProfile).not.toHaveBeenCalled();
});
test("a temporary session lookup failure is recoverable and is not an anonymous session", async () => {
  supabase.auth.getSession.mockRejectedValue(Object.assign(new Error("fetch failed"), { name: "AuthRetryableFetchError" }));
  await mount();
  expect(state.authStatus).toBe("network_error");
  expect(state.loadingAuth).toBe(false);
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
});
test("an empty INITIAL_SESSION cannot redirect before the initial lookup finishes", async () => {
  const pending = deferred(); supabase.auth.getSession.mockReturnValue(pending.promise); await mount();
  await act(async () => notify("INITIAL_SESSION", null));
  expect(state.loadingAuth).toBe(true);
  await act(async () => pending.resolve({ data: { session: session("a") } }));
  expect(state.user.id).toBe("a");
});

test("valid password login works even if the SDK event was missed", async () => {
  supabase.auth.getSession.mockResolvedValue({data:{session:null}}); await mount();
  supabase.auth.signInWithPassword.mockResolvedValue({data:{session:session("a")}});
  await act(async () => state.signIn(" qa@example.test ", "not-a-real-password")); await tick();
  expect(state.authStatus).toBe("authenticated"); expect(state.user.id).toBe("a");
  expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({email:"qa@example.test",password:"not-a-real-password"});
});
test("wrong credentials and a temporary login outage have distinct safe messages", async () => {
  supabase.auth.getSession.mockResolvedValue({data:{session:null}}); await mount();
  supabase.auth.signInWithPassword.mockResolvedValue({error:{code:"invalid_credentials",message:"sensitive raw text"}});
  await expect(state.signIn("qa@example.test", "test")).rejects.toMatchObject({code:"INVALID_CREDENTIALS",message:"Email ou palavra-passe inválidos."});
  supabase.auth.signInWithPassword.mockRejectedValue(new TypeError("fetch failed with token=secret"));
  await expect(state.signIn("qa@example.test", "test")).rejects.toMatchObject({kind:"network_error"});
  expect(JSON.stringify(console.warn.mock.calls)).not.toMatch(/secret|sensitive|qa@example/);
});
test("an invalid stored refresh token ends only the local session and permits login again", async () => {
  supabase.auth.getSession.mockResolvedValue({error:{code:"refresh_token_not_found"}}); await mount();
  expect(state.authStatus).toBe("session_expired"); expect(state.user).toBeNull();
  supabase.auth.signInWithPassword.mockResolvedValue({data:{session:session("b")}});
  await act(async()=>state.signIn("b@example.test","test")); await tick();
  expect(state.authStatus).toBe("authenticated"); expect(state.user.id).toBe("b");
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
});
test("automatic refresh keeps the identity/profile and never starts an extra refresh loop", async () => {
  await mount(); await tick(); getProfile.mockClear();
  await act(async()=>notify("TOKEN_REFRESHED", {...session("a"),access_token:"new-token"})); await tick();
  expect(state.authStatus).toBe("authenticated"); expect(state.profile.first_name).toBe("QA");
  expect(getProfile).not.toHaveBeenCalled(); expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
});
test("logout uses local scope and a subsequent login has no previous profile", async () => {
  await mount(); await tick();
  await act(async()=>state.signOut());
  expect(supabase.auth.signOut).toHaveBeenCalledWith({scope:"local"});
  expect(state.authStatus).toBe("unauthenticated"); expect(state.profile).toBeNull();
  await act(async()=>notify("SIGNED_IN",session("b"))); await tick();
  expect(state.user.id).toBe("b"); expect(state.authStatus).toBe("authenticated");
});
test("initialization has a finite timeout and can be retried without clearing storage", async () => {
  supabase.auth.getSession.mockReturnValue(new Promise(()=>{})); await mount();
  await act(async()=>jest.advanceTimersByTime(15000));
  expect(state.authStatus).toBe("network_error"); expect(state.loadingAuth).toBe(false);
  supabase.auth.getSession.mockResolvedValue({data:{session:session("a")}});
  await act(async()=>state.refreshAuth()); await tick(); expect(state.user.id).toBe("a");
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
});
test("profile timeout is separate from a valid authenticated session", async () => {
  getProfile.mockReturnValue(new Promise(()=>{})); await mount(); await tick();
  await act(async()=>jest.advanceTimersByTime(15000));
  expect(state.authStatus).toBe("authenticated"); expect(state.loadingProfile).toBe(false);
  expect(state.profileError).not.toBe(""); expect(state.onboardingRequired).toBe(false);
});
test("a user without a store is authenticated and waits for organization authorization, not forced store onboarding", async () => {
  await mount(); await tick(); expect(state.onboardingRequired).toBe(false);
  expect(state.authStatus).toBe("authenticated"); expect(state.profile.organization_id).toBeNull();
});
test("a late sign-in promise cannot undo a newer logout event", async () => {
  await mount(); await tick(); const pending=deferred();
  supabase.auth.signInWithPassword.mockReturnValue(pending.promise);
  let login; await act(async()=>{login=state.signIn("b@example.test","test");});
  await act(async()=>notify("SIGNED_OUT",null));
  await act(async()=>{pending.resolve({data:{session:session("b")}}); await login;});
  expect(state.user).toBeNull();
});
test("F5/reopening restores the stored SDK session and StrictMode ignores its first discarded lookup", async () => {
  const stale=deferred(); supabase.auth.getSession.mockReturnValueOnce(stale.promise).mockResolvedValue({data:{session:session("b")}});
  await act(async()=>root.render(<React.StrictMode><AuthProvider><Probe /></AuthProvider></React.StrictMode>)); await tick();
  await act(async()=>stale.resolve({data:{session:session("a")}}));
  expect(state.user.id).toBe("b"); expect(state.authStatus).toBe("authenticated");
});

test("a stored session already removed during SDK startup is reported as expired", async () => {
  require("../lib/supabase").initialStoredSession = true;
  supabase.auth.getSession.mockResolvedValue({data:{session:null}}); await mount();
  expect(state.authStatus).toBe("session_expired"); expect(state.authError).toContain("sessão expirou");
});
test("an unavailable logout endpoint keeps the identity and returns a safe retry error", async () => {
  await mount(); await tick();
  supabase.auth.signOut.mockRejectedValue(new TypeError("fetch failed token=secret"));
  await act(async()=>{await expect(state.signOut()).rejects.toMatchObject({kind:"network_error"});});
  expect(state.user.id).toBe("a"); expect(state.authStatus).toBe("authenticated");
  expect(JSON.stringify(console.warn.mock.calls)).not.toContain("token=secret");
});
test("a late expiry hint cannot discard a newer SDK sign-in, even without accessible storage", async () => {
  await mount(); await tick(); const pending=deferred();
  supabase.auth.getSession.mockReturnValue(pending.promise);
  await act(async()=>window.dispatchEvent(new Event("promopilot:session-expired")));
  await act(async()=>notify("SIGNED_IN",session("b")));
  await act(async()=>pending.resolve({data:{session:null}})); await tick();
  expect(state.user.id).toBe("b"); expect(state.authStatus).toBe("authenticated");
});
