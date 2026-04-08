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
  const { user, loadingAuth } = useAuth();

  // 🔄 Enquanto verifica autenticação
  if (loadingAuth) {
    return <LoadingScreen />;
  }

  // 🚫 Não autenticado → redireciona
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // ✅ Autenticado → mostra conteúdo
  return children;
}