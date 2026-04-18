import React from "react";
import { Navigate } from "react-router-dom";
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

  if (loadingAuth || (user && loadingProfile)) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (onboardingRequired) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
