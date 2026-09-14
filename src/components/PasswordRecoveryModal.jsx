import React, { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getPasswordValidationMessage,
  isValidPassword,
} from "../utils/validators";

export default function PasswordRecoveryModal({ open }) {
  const { completePasswordRecovery } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cleanPassword = useMemo(
    () => String(password || "").trim(),
    [password],
  );

  if (!open) return null;

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (!isValidPassword(cleanPassword)) {
      setError(getPasswordValidationMessage(cleanPassword));
      return;
    }

    if (cleanPassword !== String(confirm || "").trim()) {
      setError("As palavras-passe não coincidem.");
      return;
    }

    try {
      setLoading(true);
      await completePasswordRecovery(cleanPassword);
    } catch (recoveryError) {
      setError(
        recoveryError?.message ||
          "Não foi possível alterar a palavra-passe.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="force-password-overlay">
      <div
        className="force-password-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-password-title"
      >
        <h2 id="recovery-password-title">Definir nova palavra-passe</h2>
        <p>
          O link do Supabase foi validado. Escolhe agora a nova
          palavra-passe da tua conta.
        </p>

        <form onSubmit={submit} className="force-password-form">
          <label htmlFor="recovery-new-password">Nova palavra-passe</label>
          <input
            id="recovery-new-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
            disabled={loading}
          />

          <label htmlFor="recovery-confirm-password">
            Confirmar palavra-passe
          </label>
          <input
            id="recovery-confirm-password"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            required
            disabled={loading}
          />

          <div className="force-password-rules">
            Mínimo 8 caracteres, com letras, números e pelo menos 1 carácter
            especial.
          </div>

          {error && <p className="force-password-error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "A guardar..." : "Guardar nova palavra-passe"}
          </button>
        </form>
      </div>
    </div>
  );
}
