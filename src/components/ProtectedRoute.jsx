import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function LoadingScreen() {
  return (
    <div className="auth-loading">
      <div className="spinner" />
      <p>A verificar acesso...</p>
    </div>
  );
}

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const { user, loadingAuth, loadingProfile, onboardingRequired } = useAuth();

  if (loadingAuth || (user && loadingProfile)) {
    return <LoadingScreen />;
  }

  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const loginTarget = `/login?next=${encodeURIComponent(returnTo)}`;

  if (!user) {
    return <Navigate to={loginTarget} replace state={{ from: location }} />;
  }

  if (onboardingRequired) {
    return <Navigate to={loginTarget} replace state={{ from: location }} />;
  }

  return children;
}
