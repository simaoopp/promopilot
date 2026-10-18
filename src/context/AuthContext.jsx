import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import { getProfile, upsertProfile } from "../services/profileService";
import {
  hasMissingProfileFields,
  isOnboardingRequired,
  profileRequiresPasswordChange,
} from "../utils/accessControl";
import {
  clearSupabaseAuthStorage,
  isSupabaseRefreshTokenError,
  recoverFromInvalidSupabaseSession,
} from "../utils/supabaseAuthRecovery";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const lastLoadedProfileUserId = useRef(null);
  const profileRef = useRef(null);
  const currentUserId = useRef(null);
  const generation = useRef(0);
  const [profileError, setProfileError] = useState("");

  const acceptUser = useCallback((nextUser) => {
    const id = nextUser?.id || null;
    if (currentUserId.current !== id || !id) {
      currentUserId.current = id;
      generation.current += 1;
      lastLoadedProfileUserId.current = null;
      profileRef.current = null;
      setProfile(null);
      setProfileError("");
      setLoadingProfile(Boolean(id));
      setPasswordRecovery(false);
    }
    setUser(nextUser);
  }, []);

  const loadProfile = useCallback(async (userId, { force = false } = {}) => {
    if (!userId || currentUserId.current !== userId) return null;
    if (!force && lastLoadedProfileUserId.current === userId) return profileRef.current;
    const request = ++generation.current;
    const isCurrent = () => request === generation.current && currentUserId.current === userId;
    setLoadingProfile(true);
    setProfileError("");
    try {
      const data = await getProfile(userId);
      if (!isCurrent()) return null;
      profileRef.current = data;
      setProfile(data);
      lastLoadedProfileUserId.current = userId;
      return data;
    } catch {
      if (isCurrent()) {
        setProfileError("Não foi possível carregar o perfil. Tente novamente.");
        lastLoadedProfileUserId.current = null;
      }
      return null;
    } finally {
      if (isCurrent()) setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let revision = 0;
    let timer;
    const applySession = (session, event) => {
      if (!active) return;
      const nextUser = session?.user || null;
      acceptUser(nextUser);
      const recoveryUrl = typeof window !== "undefined" && (
        /(?:^|[?#&])type=recovery(?:&|$)/i.test(`${window.location.search}${window.location.hash}`) ||
        new URLSearchParams(window.location.search).get("reset") === "1"
      );
      if (nextUser && (event === "PASSWORD_RECOVERY" || recoveryUrl)) setPasswordRecovery(true);
      setLoadingAuth(false);
      clearTimeout(timer);
      // Leave Supabase's synchronous auth callback before making another request.
      if (nextUser) timer = setTimeout(() => { if (active) loadProfile(nextUser.id); }, 0);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      revision += 1;
      applySession(session, event);
    });
    const initialRevision = revision;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active || revision !== initialRevision) return;
        if (error) throw error;
        applySession(data?.session);
      } catch (error) {
        if (!active || revision !== initialRevision) return;
        if (isSupabaseRefreshTokenError(error)) await recoverFromInvalidSupabaseSession(supabase);
        if (active && revision === initialRevision) applySession(null);
      }
    })();
    return () => {
      active = false;
      generation.current += 1;
      clearTimeout(timer);
      subscription?.unsubscribe();
    };
  }, [acceptUser, loadProfile]);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: String(email || "").trim(),
      password,
    });

    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error && !isSupabaseRefreshTokenError(error)) throw error;

    if (error) {
      clearSupabaseAuthStorage();
    }

    acceptUser(null);
    setPasswordRecovery(false);
  }, [acceptUser]);

  const updatePassword = useCallback(async (newPassword) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;
  }, []);



  const completePasswordRecovery = useCallback(
    async (newPassword) => {
      await updatePassword(newPassword);
      setPasswordRecovery(false);

      if (typeof window !== "undefined") {
        window.history.replaceState(
          {},
          document.title,
          `${window.location.origin}/login`,
        );
      }
    },
    [updatePassword],
  );

  const completeOnboarding = useCallback(
    async ({ password, first_name, last_name, store, requirePassword }) => {
      if (!user?.id) {
        throw new Error("Utilizador não autenticado.");
      }

      if (requirePassword) {
        await updatePassword(password);
      }

      const updatedProfile = await upsertProfile(user.id, {
        first_name,
        last_name,
        store,
        must_change_password: false,
      });

      if (currentUserId.current !== user.id) throw new Error("A sessão mudou. Inicie sessão novamente.");
      generation.current += 1;
      profileRef.current = updatedProfile;
      setProfile(updatedProfile);
      setProfileError("");
      setLoadingProfile(false);
      lastLoadedProfileUserId.current = user.id;
      return updatedProfile;
    },
    [updatePassword, user?.id],
  );

  const requiresPasswordChange = profileRequiresPasswordChange(profile);
  const missingProfileFields = !!user && hasMissingProfileFields(profile);
  const onboardingRequired = !profileError && isOnboardingRequired({
    user,
    profile,
    loadingProfile,
  });

  const refreshProfile = useCallback(
    () => loadProfile(user?.id, { force: true }),
    [loadProfile, user?.id],
  );

  const value = useMemo(
    () => ({
      user,
      profile,
      loadingAuth,
      loadingProfile,
      profileError,
      onboardingRequired,
      requiresPasswordChange,
      missingProfileFields,
      passwordRecovery,
      signIn,
      signOut,
      updatePassword,
      completePasswordRecovery,
      completeOnboarding,
      refreshProfile,
    }),
    [
      user,
      profile,
      loadingAuth,
      loadingProfile,
      profileError,
      onboardingRequired,
      requiresPasswordChange,
      missingProfileFields,
      passwordRecovery,
      signIn,
      signOut,
      updatePassword,
      completePasswordRecovery,
      completeOnboarding,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider.");
  }

  return context;
}
