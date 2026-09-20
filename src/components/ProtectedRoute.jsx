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
  const { user, loadingAuth, loadingProfile, onboardingRequired } = useAuth();
  const location = useLocation();

  if (loadingAuth || (user && loadingProfile)) {
    return <LoadingScreen />;
  }

  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  if (!user) {
    return <Navigate to="/login" replace state={{ returnTo }} />;
  }

  if (onboardingRequired) {
    return <Navigate to="/login" replace state={{ returnTo }} />;
  }

  return children;
}
