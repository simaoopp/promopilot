import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ForcePasswordChangeModal from "./ForcePasswordChangeModal";

function LoadingScreen() {
  return (
    <div className="auth-loading">
      <div className="spinner" />
      <p>A verificar acesso...</p>
    </div>
  );
}

export default function ProtectedRoute({ children }) {
  const {
    user,
    loadingAuth,
    loadingProfile,
    onboardingRequired,
    requiresPasswordChange,
  } = useAuth();

  if (loadingAuth || loadingProfile) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      {children}
      <ForcePasswordChangeModal
        open={onboardingRequired}
        requirePassword={requiresPasswordChange}
      />
    </>
  );
}
