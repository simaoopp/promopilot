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
import { preloadCatalogoPesquisa } from "../services/catalogoPesquisaService";
import { getProfile, upsertProfile } from "../services/profileService";
import {
  hasMissingProfileFields,
  isOnboardingRequired,
  profileRequiresPasswordChange,
} from "../utils/accessControl";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const lastLoadedProfileUserId = useRef(null);
  const profileRef = useRef(null);
  const preloadedCatalogUserId = useRef(null);

  const preloadCatalogForUser = useCallback((userId) => {
    if (!userId || preloadedCatalogUserId.current === userId) {
      return;
    }

    preloadedCatalogUserId.current = userId;
    preloadCatalogoPesquisa({ pageSize: 1000 }).catch((error) => {
      console.warn("Não foi possível pré-carregar o catálogo de artigos.", error);
      preloadedCatalogUserId.current = null;
    });
  }, []);

  const loadProfile = useCallback(async (userId, options = {}) => {
    const { force = false } = options;

    if (!userId) {
      lastLoadedProfileUserId.current = null;
      setProfile(null);
      setLoadingProfile(false);
      return null;
    }

    if (!force && lastLoadedProfileUserId.current === userId) {
      return profileRef.current;
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
  }, []);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!active) return;

        if (error) {
          console.error("Erro ao buscar sessão:", error.message);

          if (/refresh token/i.test(error.message || "")) {
            await supabase.auth.signOut({ scope: "local" }).catch(() => {});

            if (typeof window !== "undefined") {
              Object.keys(window.localStorage)
                .filter((key) => key.startsWith("sb-"))
                .forEach((key) => window.localStorage.removeItem(key));
            }
          }

          setUser(null);
          setProfile(null);
          lastLoadedProfileUserId.current = null;
          preloadedCatalogUserId.current = null;
          setLoadingProfile(false);
          setLoadingAuth(false);
          return;
        }

        const currentUser = data?.session?.user ?? null;
        setUser(currentUser);
        setLoadingAuth(false);

        if (currentUser?.id) {
          preloadCatalogForUser(currentUser.id);
          await loadProfile(currentUser.id);
        } else {
          setProfile(null);
          lastLoadedProfileUserId.current = null;
          preloadedCatalogUserId.current = null;
          setLoadingProfile(false);
        }
      } catch (error) {
        if (!active) return;
        console.error("Erro inesperado ao carregar sessão:", error);
        setUser(null);
        setProfile(null);
        lastLoadedProfileUserId.current = null;
        preloadedCatalogUserId.current = null;
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
        preloadedCatalogUserId.current = null;
        setLoadingProfile(false);
        return;
      }

      preloadCatalogForUser(currentUser.id);

      if (lastLoadedProfileUserId.current !== currentUser.id) {
        loadProfile(currentUser.id);
      }
    });

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [loadProfile, preloadCatalogForUser]);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: String(email || "").trim(),
      password,
    });

    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    setUser(null);
    setProfile(null);
    lastLoadedProfileUserId.current = null;
    preloadedCatalogUserId.current = null;
    setLoadingProfile(false);
  }, []);

  const updatePassword = useCallback(async (newPassword) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;
  }, []);

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

      setProfile(updatedProfile);
      lastLoadedProfileUserId.current = user.id;
      return updatedProfile;
    },
    [updatePassword, user?.id],
  );

  const requiresPasswordChange = profileRequiresPasswordChange(profile);
  const missingProfileFields = !!user && hasMissingProfileFields(profile);
  const onboardingRequired = isOnboardingRequired({
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
      onboardingRequired,
      requiresPasswordChange,
      missingProfileFields,
      signIn,
      signOut,
      updatePassword,
      completeOnboarding,
      refreshProfile,
    }),
    [
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
