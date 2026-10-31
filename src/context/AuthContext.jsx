import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase, initialStoredSession } from "../lib/supabase";
import { getProfile, upsertProfile } from "../services/profileService";
import { readSession } from "../services/authSessionService";
import { setPermissionSnapshot } from "../services/platformService";
import { hasMissingProfileFields, isOnboardingRequired, profileRequiresPasswordChange } from "../utils/accessControl";
import { authIssue, classifyAuthError, logAuthIssue, withAuthDeadline } from "../utils/authErrors";
import { isSupabaseRefreshTokenError, recoverFromInvalidSupabaseSession, SESSION_EXPIRED_EVENT } from "../utils/supabaseAuthRecovery";

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [rawProfile, setRawProfile] = useState(null);
  const [access, setAccess] = useState(null);
  const [authStatus, setAuthStatus] = useState("initializing");
  const [authError, setAuthError] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const currentUserId = useRef(null);
  const profileRef = useRef(null);
  const loadedProfileId = useRef(null);
  const generation = useRef(0);
  const revision = useRef(0);
  const mounted = useRef(false);
  const profileTimer = useRef(null);
  const intentionalLogout = useRef(false);
  const intent = useRef(0);
  const storedAtStartup = useRef(initialStoredSession);

  const acceptUser = useCallback(nextUser => {
    const id = nextUser?.id || null;
    if (currentUserId.current !== id || !id) {
      currentUserId.current = id;
      generation.current += 1;
      loadedProfileId.current = null;
      profileRef.current = null;
      setRawProfile(null); setAccess(null); setPermissionSnapshot(null);
      setProfileError(""); setLoadingProfile(Boolean(id)); setPasswordRecovery(false);
    }
    setUser(nextUser);
  }, []);
  const loadProfile = useCallback(async (id, { force = false } = {}) => {
    if (!id || currentUserId.current !== id) return null;
    if (!force && loadedProfileId.current === id) return profileRef.current;
    const request = ++generation.current;
    const current = () => mounted.current && request === generation.current && currentUserId.current === id;
    setLoadingProfile(true); setProfileError("");
    try {
      const data = await withAuthDeadline(getProfile(id));
      if (!current()) return null;
      profileRef.current = data; setRawProfile(data); loadedProfileId.current = id;
      return data;
    } catch (error) {
      if (current()) {
        const issue = classifyAuthError(error);
        logAuthIssue("profile.load", issue);
        setProfileError(issue.kind === "permission_error" ? issue.message : "Não foi possível carregar o perfil. Tenta novamente.");
        loadedProfileId.current = null;
      }
      return null;
    } finally { if (current()) setLoadingProfile(false); }
  }, []);
  const applySession = useCallback((session, event) => {
    if (!mounted.current) return;
    const nextUser = session?.user || null;
    const ended = !nextUser && (currentUserId.current || storedAtStartup.current) && !intentionalLogout.current;
    storedAtStartup.current = false;
    acceptUser(nextUser);
    setAuthStatus(nextUser ? "authenticated" : ended ? "session_expired" : "unauthenticated");
    setAuthError(ended ? authIssue("SESSION_EXPIRED").message : "");
    const recoveryUrl = /(?:^|[?#&])type=recovery(?:&|$)/i.test(`${window.location.search}${window.location.hash}`)
      || new URLSearchParams(window.location.search).get("reset") === "1";
    if (nextUser && (event === "PASSWORD_RECOVERY" || recoveryUrl)) setPasswordRecovery(true);
    clearTimeout(profileTimer.current);
    // Never await or call another Supabase API inside onAuthStateChange: the
    // SDK invokes it while holding its session lock.
    if (nextUser) profileTimer.current = setTimeout(() => {
      if (mounted.current) loadProfile(nextUser.id, { force: event === "USER_UPDATED" });
    }, 0);
  }, [acceptUser, loadProfile]);
  const refreshAuth = useCallback(async () => {
    const request = ++revision.current;
    setAuthStatus("initializing"); setAuthError("");
    try {
      const session = await readSession();
      if (mounted.current && request === revision.current) applySession(session);
    } catch (error) {
      if (!mounted.current || request !== revision.current) return;
      const issue = classifyAuthError(error);
      logAuthIssue("session.initialize", issue);
      setAuthStatus(issue.kind); setAuthError(issue.message);
      // A transport/lock failure is not proof that a session is invalid.
      if (issue.kind === "session_expired") acceptUser(null);
    }
  }, [acceptUser, applySession]);
  useEffect(() => {
    mounted.current = true;
    const expired = () => {
      const request = revision.current;
      // This is a hint from a failed request, not authority to erase a newer
      // login. Verify without recursively invoking recovery, and compare events.
      withAuthDeadline(supabase.auth.getSession()).then(({ data, error }) => {
        if (!mounted.current || request !== revision.current || data?.session) return;
        if (error && classifyAuthError(error).kind !== "session_expired") throw error;
        revision.current += 1; acceptUser(null);
        setAuthStatus("session_expired"); setAuthError(authIssue("SESSION_EXPIRED").message);
      }).catch(error => {
        if (!mounted.current || request !== revision.current) return;
        const issue = classifyAuthError(error); logAuthIssue("session.verify_expiry", issue);
        setAuthStatus(issue.kind); setAuthError(issue.message);
      });
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION(null) also occurs on network errors. The bounded
      // getSession result is the authoritative initialization outcome.
      if (!mounted.current || event === "INITIAL_SESSION") return;
      revision.current += 1;
      applySession(session, event);
    });
    refreshAuth();
    return () => {
      mounted.current = false; revision.current += 1; generation.current += 1;
      clearTimeout(profileTimer.current); subscription?.unsubscribe();
      window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
    };
  }, [acceptUser, applySession, refreshAuth]);

  const signIn = useCallback(async (email, password) => {
    const attempt = ++intent.current;
    const before = revision.current;
    try {
      const { data, error } = await withAuthDeadline(supabase.auth.signInWithPassword({ email: String(email || "").trim(), password }));
      if (error) throw error;
      if (!data?.session?.user) throw authIssue("AUTH_ERROR");
      // The normal path is SIGNED_IN. Also handle SDK adapters that resolve
      // without emitting it, without overwriting a newer logout/account change.
      if (mounted.current && attempt === intent.current && before === revision.current) {
        revision.current += 1; applySession(data.session);
      }
    } catch (error) {
      const issue = classifyAuthError(error); logAuthIssue("session.sign_in", issue); throw issue;
    }
  }, [applySession]);
  const signOut = useCallback(async () => {
    intent.current += 1; intentionalLogout.current = true;
    const before = revision.current;
    try {
      const { error } = await withAuthDeadline(supabase.auth.signOut({ scope: "local" }));
      if (error) {
        if (!isSupabaseRefreshTokenError(error)) throw error;
        await recoverFromInvalidSupabaseSession(supabase);
      }
      // Do not erase a new login that completed while logout was pending.
      if (mounted.current && (before === revision.current || !currentUserId.current)) {
        revision.current += 1; acceptUser(null); setAuthStatus("unauthenticated"); setAuthError("");
      }
    } catch (error) {
      const issue = classifyAuthError(error); logAuthIssue("session.sign_out", issue); throw issue;
    } finally { intentionalLogout.current = false; }
  }, [acceptUser]);
  const updatePassword = useCallback(async password => {
    const { error } = await withAuthDeadline(supabase.auth.updateUser({ password }));
    if (error) throw classifyAuthError(error);
  }, []);
  const completePasswordRecovery = useCallback(async password => {
    await updatePassword(password); setPasswordRecovery(false);
    window.history.replaceState({}, document.title, "/login");
  }, [updatePassword]);
  const completeOnboarding = useCallback(async ({ password, first_name, last_name, store, requirePassword }) => {
    const id = currentUserId.current;
    if (!id) throw authIssue("AUTH_REQUIRED", 401);
    if (requirePassword) await updatePassword(password);
    const updated = await withAuthDeadline(upsertProfile(id, { first_name, last_name, store, must_change_password: false }));
    if (currentUserId.current !== id) throw authIssue("SESSION_CHANGED");
    generation.current += 1; profileRef.current = updated; loadedProfileId.current = id;
    setRawProfile(updated); setProfileError(""); setLoadingProfile(false);
    return updated;
  }, [updatePassword]);
  const updateAccessContext = useCallback((id, context) => {
    if (id === currentUserId.current) setAccess(previous => JSON.stringify(previous) === JSON.stringify(context) ? previous : context);
  }, []);
  const profile = useMemo(() => rawProfile && ({ ...rawProfile,
    store: access ? access.stores?.find(item => item.id === access.storeId)?.name || "" : rawProfile.store || "",
    organization_id: access?.organizationId || null,
    platformAdmin: access?.platformAdmin === true,
    availableStores: (access?.stores || []).filter(item => item.status === "active"),
  }), [rawProfile, access]);
  const loadingAuth = authStatus === "initializing";
  const requiresPasswordChange = profileRequiresPasswordChange(profile);
  const missingProfileFields = !!user && hasMissingProfileFields(profile);
  const onboardingRequired = !profileError && isOnboardingRequired({ user, profile, loadingProfile });
  const refreshProfile = useCallback(() => loadProfile(user?.id, { force: true }), [loadProfile, user?.id]);
  const value = { user, profile, authStatus, authError, loadingAuth, loadingProfile, profileError,
    onboardingRequired, requiresPasswordChange, missingProfileFields, passwordRecovery,
    signIn, signOut, updatePassword, completePasswordRecovery, completeOnboarding, refreshProfile, refreshAuth, updateAccessContext };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth deve ser usado dentro de um AuthProvider.");
  return value;
}
