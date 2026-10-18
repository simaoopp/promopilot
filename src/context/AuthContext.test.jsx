import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider, useAuth } from "./AuthContext";
import { supabase } from "../lib/supabase";
import { getProfile } from "../services/profileService";

jest.mock("../lib/supabase", () => ({ supabase: { auth: {
  getSession: jest.fn(), onAuthStateChange: jest.fn(), signOut: jest.fn(),
} } }));
jest.mock("../services/profileService", () => ({ getProfile: jest.fn(), upsertProfile: jest.fn() }));
let root, host, state, notify;
const session = id => ({ user: { id } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function Probe() { state = useAuth(); return <p>{state.profile?.first_name}</p>; }
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); global.IS_REACT_ACT_ENVIRONMENT = true;
  supabase.auth.getSession.mockResolvedValue({ data: { session: session("a") } });
  supabase.auth.signOut.mockResolvedValue({ error: null });
  supabase.auth.onAuthStateChange.mockImplementation(fn => { notify = fn; return { data: { subscription: { unsubscribe: jest.fn() } } }; });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); jest.useRealTimers(); });
async function mount() { await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>)); }
async function tick() { await act(async () => jest.runOnlyPendingTimers()); }
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
  expect(state.profileError).toContain("Tente novamente"); expect(state.onboardingRequired).toBe(false);
  getProfile.mockResolvedValue({ first_name: "QA", last_name: "User", store: "Synthetic", must_change_password: false });
  await act(async () => state.refreshProfile()); expect(state.profileError).toBe(""); expect(state.profile.first_name).toBe("QA");
});
test("initial session response cannot undo a newer logout event", async () => {
  const pending = deferred(); supabase.auth.getSession.mockReturnValue(pending.promise); await mount();
  await act(async () => notify("SIGNED_OUT", null));
  await act(async () => pending.resolve({ data: { session: session("a") } })); await tick();
  expect(state.user).toBeNull(); expect(getProfile).not.toHaveBeenCalled();
});
