import React, { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";

function passwordValida(password) {
  const limpa = String(password || "").trim();

  const minLength = limpa.length >= 8;
  const hasLetter = /[A-Za-zÀ-ÿ]/.test(limpa);
  const hasNumber = /\d/.test(limpa);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-\\/\[\];'`~+=]/.test(limpa);

  const passwordsProibidas = [
    "123",
    "1234",
    "12345",
    "123456",
    "password",
    "admin",
    "qwerty",
  ];

  const notCommon = !passwordsProibidas.includes(limpa.toLowerCase());

  return minLength && hasLetter && hasNumber && hasSpecial && notCommon;
}

export default function ForcePasswordChangeModal({ open, onSuccess }) {
  const { updatePassword } = useAuth();

  const [novaPassword, setNovaPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordTrimmed = useMemo(
    () => String(novaPassword || "").trim(),
    [novaPassword]
  );

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");

    if (!passwordValida(passwordTrimmed)) {
      setErro(
        "A nova palavra-passe deve ter pelo menos 8 caracteres, incluir letras, números e 1 carácter especial, e não pode ser demasiado comum."
      );
      return;
    }

    if (passwordTrimmed !== confirmarPassword.trim()) {
      setErro("As palavras-passe não coincidem.");
      return;
    }

    try {
      setLoading(true);
      await updatePassword(passwordTrimmed);
      sessionStorage.removeItem("force_password_change");
      onSuccess?.();
    } catch (err) {
      setErro(err?.message || "Erro ao atualizar a palavra-passe.");
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
        aria-labelledby="force-password-title"
      >
        <h2 id="force-password-title">
          Alteração obrigatória da palavra-passe
        </h2>

        <p>
          Está a usar a palavra-passe padrão. Para continuar, precisa definir
          uma nova palavra-passe.
        </p>

        <form onSubmit={handleSubmit} className="force-password-form">
          <label htmlFor="nova-password">Nova palavra-passe</label>
          <input
            id="nova-password"
            type="password"
            value={novaPassword}
            onChange={(e) => setNovaPassword(e.target.value)}
            placeholder="Nova palavra-passe"
            autoComplete="new-password"
            required
            disabled={loading}
          />

          <label htmlFor="confirmar-password">Confirmar palavra-passe</label>
          <input
            id="confirmar-password"
            type="password"
            value={confirmarPassword}
            onChange={(e) => setConfirmarPassword(e.target.value)}
            placeholder="Confirmar palavra-passe"
            autoComplete="new-password"
            required
            disabled={loading}
          />

          <div className="force-password-rules">
            Mínimo 8 caracteres, com letras, números e pelo menos 1 carácter
            especial.
          </div>

          {erro && <p className="force-password-error">{erro}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "A guardar..." : "Guardar nova palavra-passe"}
          </button>
        </form>
      </div>
    </div>
  );
}