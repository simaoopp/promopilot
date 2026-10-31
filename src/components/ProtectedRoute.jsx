import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import AppLoading from "./AppLoading";
import AuthStateError from "./AuthStateError";
import ProfileLoadError from "./ProfileLoadError";
import { useAuth } from "../context/AuthContext";


export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const { user, authStatus, loadingAuth, loadingProfile, profileError, onboardingRequired } = useAuth();

  if (loadingAuth || (user && loadingProfile)) {
    return <AppLoading message="A verificar o seu acesso…" />;
  }

  if (["network_error", "auth_error", "permission_error"].includes(authStatus)) return <AuthStateError />;

  if (!user) {
    const next = `${location.pathname}${location.search || ""}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  if (profileError) return <ProfileLoadError />;

  if (onboardingRequired) {
    return <Navigate to={`/login?next=${encodeURIComponent(`${location.pathname}${location.search || ""}`)}`} replace />;
  }

  return children;
}
