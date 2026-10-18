import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { loadAccess, setPermissionSnapshot } from "../services/platformService";

const PermissionContext = createContext(null);
export function PermissionProvider({ children }) {
  const { user, onboardingRequired } = useAuth();
  const [state, setState] = useState({ userId: null, context: null, loading: true, error: "" });
  const generation = useRef(0);
  const activeRequest = useRef(null);
  const invalidate = useCallback(() => { generation.current += 1; activeRequest.current?.abort(); }, []);
  const refresh = useCallback(async () => {
    activeRequest.current?.abort();
    const id = ++generation.current;
    if (!user?.id || onboardingRequired) {
      setPermissionSnapshot(null);
      setState({ userId: null, context: null, loading: false, error: "" });
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      const context = await loadAccess(controller.signal);
      if (id !== generation.current) return;
      setPermissionSnapshot({ ...context, userId: user.id });
      setState({ userId: user.id, context, loading: false, error: "" });
    } catch (error) {
      if (id !== generation.current || controller.signal.aborted) return;
      setPermissionSnapshot(null);
      setState({ userId: user.id, context: null, loading: false, error: error.message || "Permissões indisponíveis." });
    }
  }, [user?.id, onboardingRequired]);
  useEffect(() => {
    setPermissionSnapshot(null);
    setState({ userId: null, context: null, loading: true, error: "" });
    refresh();
    const onFocus = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = setInterval(onFocus, 30000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      invalidate(); clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh, invalidate]);
  const context = state.userId === user?.id ? state.context : null;
  const value = useMemo(() => ({
    context, loading: state.loading || (!!user && !onboardingRequired && state.userId !== user.id), error: state.error,
    can: (permission) => context?.permissions?.[permission] === true,
    hasPage: (key) => context?.pages?.some(page => page.page_key === key) === true,
    refresh,
  }), [context, state, user, onboardingRequired, refresh]);
  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}
export function usePermissions() {
  const value = useContext(PermissionContext);
  if (!value) throw new Error("usePermissions exige PermissionProvider.");
  return value;
}
