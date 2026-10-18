import React from "react";
import { useAuth } from "../context/AuthContext";

export default function ProfileLoadError() {
  const { profileError, refreshProfile } = useAuth();
  return <main className="pp-access-state" role="alert">
    <h1>Não foi possível carregar a conta</h1>
    <p>{profileError}</p>
    <button className="primary" type="button" onClick={refreshProfile}>Tentar novamente</button>
  </main>;
}
