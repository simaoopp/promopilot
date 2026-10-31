import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { classifyAuthError } from "../utils/authErrors";

export default function AuthStateError() {
  const { authError, authStatus, refreshAuth, signOut, user } = useAuth();
  const [logoutError, setLogoutError] = useState("");
  async function leave() {
    try { await signOut(); } catch (error) { setLogoutError(classifyAuthError(error).message); }
  }
  return <main className="pp-access-state" role="alert">
    <h1>{authStatus === "network_error" ? "Ligação temporariamente indisponível" : "Não foi possível verificar a sessão"}</h1>
    <p>{authError}</p>
    <button className="primary" type="button" onClick={refreshAuth}>Tentar novamente</button>
    {user && <button type="button" onClick={leave}>Terminar sessão</button>}
    {logoutError && <p>{logoutError}</p>}
  </main>;
}
