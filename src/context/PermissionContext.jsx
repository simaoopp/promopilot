import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { loadAccess, setPermissionSnapshot } from "../services/platformService";
import { classifyAuthError, logAuthIssue } from "../utils/authErrors";

const PermissionContext = createContext(null);
export function PermissionProvider({ children }) {
  const { user, authStatus, loadingProfile, profileError, updateAccessContext } = useAuth();
  const ready = authStatus === "authenticated" && !loadingProfile && !profileError;
  const [state, setState] = useState({ userId: null, context: null, loading: false, error: "", status: "initializing" });
  const generation = useRef(0);
  const activeRequest = useRef(null);
  const invalidate = useCallback(() => { generation.current += 1; activeRequest.current?.abort(); }, []);
  const refresh = useCallback(async () => {
    activeRequest.current?.abort();
    const id = ++generation.current;
    if (!user?.id || !ready) {
      setPermissionSnapshot(null);
      setState({ userId: null, context: null, loading: false, error: "", status: "initializing" });
      return;
    }
    const controller = new AbortController(); activeRequest.current = controller;
    // Keep an already-authorized page mounted during background revalidation;
    // errors immediately revoke its UI context, but never its Auth session.
    setState(previous => ({ ...previous, loading: !previous.context, error: "" }));
    try {
      const context = await loadAccess(controller.signal);
      if (id !== generation.current) return;
      setPermissionSnapshot({ ...context, userId: user.id });
      updateAccessContext(user.id, context);
      setState({ userId: user.id, context, loading: false, error: "", status: "ready" });
    } catch (error) {
      if (id !== generation.current || controller.signal.aborted) return;
      const issue = classifyAuthError(error);
      logAuthIssue("permissions.load", issue);
      setPermissionSnapshot(null); updateAccessContext(user.id, null);
      setState({ userId: user.id, context: null, loading: false,
        error: ["ACCESS_API_NOT_DEPLOYED", "API_INVALID_RESPONSE", "ACCESS_CONTEXT_INVALID"].includes(error.code) ? error.message : issue.message,
        status: issue.kind });
    }
  }, [user?.id, ready, updateAccessContext]);
  useEffect(() => {
    setPermissionSnapshot(null);
    setState({ userId: null, context: null, loading: true, error: "", status: "initializing" });
    refresh();
    const onFocus = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = setInterval(onFocus, 30000);
    window.addEventListener("focus", onFocus); document.addEventListener("visibilitychange", onFocus);
    return () => {
      invalidate(); clearInterval(timer);
      window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh, invalidate]);
  const context = ready && state.userId === user?.id ? state.context : null;
  const value = useMemo(() => ({
    context, loading: !!user && (!ready || state.loading || state.userId !== user.id), error: state.error, status: state.status,
    can: permission => context?.permissions?.[permission] === true,
    hasPage: key => context?.pages?.some(page => page.page_key === key) === true,
    refresh,
  }), [context, state, user, ready, refresh]);
  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}
export function usePermissions() {
  const value = useContext(PermissionContext);
  if (!value) throw new Error("usePermissions exige PermissionProvider.");
  return value;
}
