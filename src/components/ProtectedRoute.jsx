import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, loadingAuth } = useAuth();

  if (loadingAuth) {
    return <div style={{ padding: "30px" }}>Verificando acesso...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
