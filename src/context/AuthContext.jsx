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

const AuthContext = createContext(null);

function isBlank(value) {
  return !String(value || "").trim();
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const lastLoadedProfileUserId = useRef(null);

  const loadProfile = useCallback(async (userId, options = {}) => {
    const { force = false } = options;

    if (!userId) {
      lastLoadedProfileUserId.current = null;
      setProfile(null);
      setLoadingProfile(false);
      return null;
    }

    if (!force && lastLoadedProfileUserId.current === userId) {
      return profile;
    }

    try {
      setLoadingProfile(true);
      const profileData = await getProfile(userId);
      setProfile(profileData);
      lastLoadedProfileUserId.current = userId;
      return profileData;
    } catch (error) {
      console.error("Erro ao carregar perfil:", error?.message || error);
      setProfile(null);
      lastLoadedProfileUserId.current = null;
      return null;
    } finally {
      setLoadingProfile(false);
    }
  }, [profile]);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!active) return;

        if (error) {
          console.error("Erro ao buscar sessão:", error.message);
          setUser(null);
          setProfile(null);
          lastLoadedProfileUserId.current = null;
          setLoadingProfile(false);
          setLoadingAuth(false);
          return;
        }

        const currentUser = data?.session?.user ?? null;
        setUser(currentUser);
        setLoadingAuth(false);

        if (currentUser?.id) {
          await loadProfile(currentUser.id);
        } else {
          setProfile(null);
          lastLoadedProfileUserId.current = null;
          setLoadingProfile(false);
        }
      } catch (error) {
        if (!active) return;
        console.error("Erro inesperado ao carregar sessão:", error);
        setUser(null);
        setProfile(null);
        lastLoadedProfileUserId.current = null;
        setLoadingProfile(false);
        setLoadingAuth(false);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      const currentUser = session?.user ?? null;
      setUser(currentUser);
      setLoadingAuth(false);

      if (!currentUser?.id) {
        setProfile(null);
        lastLoadedProfileUserId.current = null;
        setLoadingProfile(false);
        return;
      }

      if (lastLoadedProfileUserId.current !== currentUser.id) {
        loadProfile(currentUser.id);
      }
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [loadProfile]);

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({
      email: String(email || "").trim(),
      password,
    });

    if (error) throw error;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    setUser(null);
    setProfile(null);
    lastLoadedProfileUserId.current = null;
    setLoadingProfile(false);
  }

  async function updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;
  }

  async function completeOnboarding({
    password,
    first_name,
    last_name,
    store,
    requirePassword,
  }) {
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

    setProfile(updatedProfile);
    lastLoadedProfileUserId.current = user.id;
    return updatedProfile;
  }

  const requiresPasswordChange = profile?.must_change_password === true;

  const missingProfileFields =
    !!user &&
    (!profile ||
      isBlank(profile.first_name) ||
      isBlank(profile.last_name) ||
      isBlank(profile.store));

  const onboardingRequired =
    !!user && !loadingProfile && (requiresPasswordChange || missingProfileFields);

  const value = useMemo(
    () => ({
      user,
      profile,
      loadingAuth,
      loadingProfile,
      onboardingRequired,
      requiresPasswordChange,
      missingProfileFields,
      signIn,
      signOut,
      updatePassword,
      completeOnboarding,
      refreshProfile: () => loadProfile(user?.id, { force: true }),
    }),
    [
      user,
      profile,
      loadingAuth,
      loadingProfile,
      onboardingRequired,
      requiresPasswordChange,
      missingProfileFields,
      loadProfile,
    ]
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