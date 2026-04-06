import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";

function passwordValida(password) {
  const minLength = password.length >= 6;
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-\\/\[\];'`~+=]/.test(password);
  return minLength && hasSpecial;
}

export default function ForcePasswordChangeModal({ open, onSuccess }) {
  const { updatePassword } = useAuth();

  const [novaPassword, setNovaPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");

    if (!passwordValida(novaPassword)) {
      setErro(
        "A nova palavra-passe deve ter no mínimo 6 caracteres e 1 carácter especial."
      );
      return;
    }

    if (novaPassword === "123") {
      setErro("A nova palavra-passe não pode ser 123.");
      return;
    }

    if (novaPassword !== confirmarPassword) {
      setErro("As palavras-passe não coincidem.");
      return;
    }

    try {
      setLoading(true);
      await updatePassword(novaPassword);
      sessionStorage.removeItem("force_password_change");
      onSuccess();
    } catch (err) {
      setErro(err.message || "Erro ao atualizar a palavra-passe.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="force-password-overlay">
      <div className="force-password-modal">
        <h2>Alteração obrigatória da palavra-passe</h2>
        <p>
          Está a usar a palavra-passe padrão. Para continuar, precisa definir
          uma nova palavra-passe.
        </p>

        <form onSubmit={handleSubmit} className="force-password-form">
          <label>Nova palavra-passe</label>
          <input
            type="password"
            value={novaPassword}
            onChange={(e) => setNovaPassword(e.target.value)}
            placeholder="Nova palavra-passe"
            required
          />

          <label>Confirmar palavra-passe</label>
          <input
            type="password"
            value={confirmarPassword}
            onChange={(e) => setConfirmarPassword(e.target.value)}
            placeholder="Confirmar palavra-passe"
            required
          />

          <div className="force-password-rules">
            Mínimo 6 caracteres e pelo menos 1 carácter especial.
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
