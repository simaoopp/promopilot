import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";

const STORE_OPTIONS = [
  "Loja da Praia",
  "Loja de Angra",
  "Loja de Valados",
];

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

export default function ForcePasswordChangeModal({
  open,
  requirePassword = false,
  onSuccess,
}) {
  const { completeOnboarding, profile } = useAuth();

  const [novaPassword, setNovaPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [store, setStore] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    setFirstName(profile?.first_name || "");
    setLastName(profile?.last_name || "");
    setStore(profile?.store || "");
    setNovaPassword("");
    setConfirmarPassword("");
    setErro("");
  }, [open, profile]);

  const passwordTrimmed = useMemo(
    () => String(novaPassword || "").trim(),
    [novaPassword]
  );

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");

    if (!String(firstName || "").trim()) {
      setErro("Preenche o primeiro nome.");
      return;
    }

    if (!String(lastName || "").trim()) {
      setErro("Preenche o último nome.");
      return;
    }

    if (!STORE_OPTIONS.includes(store)) {
      setErro("Seleciona uma loja válida.");
      return;
    }

    if (requirePassword) {
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
    }

    try {
      setLoading(true);

      await completeOnboarding({
        password: requirePassword ? passwordTrimmed : "",
        first_name: firstName,
        last_name: lastName,
        store,
        requirePassword,
      });

      onSuccess?.();
    } catch (err) {
      setErro(err?.message || "Erro ao concluir o registo obrigatório.");
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
          {requirePassword
            ? "Conclusão obrigatória do registo"
            : "Complete os seus dados"}
        </h2>

        <p>
          {requirePassword
            ? "Antes de continuar, precisa definir uma nova palavra-passe e completar os seus dados."
            : "Antes de continuar, precisa completar os seus dados."}
        </p>

        <form onSubmit={handleSubmit} className="force-password-form">
          <label htmlFor="first-name">Primeiro nome</label>
          <input
            id="first-name"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Primeiro nome"
            required
            disabled={loading}
          />

          <label htmlFor="last-name">Último nome</label>
          <input
            id="last-name"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Último nome"
            required
            disabled={loading}
          />

          <label htmlFor="store">Loja</label>
          <select
            id="store"
            value={store}
            onChange={(e) => setStore(e.target.value)}
            required
            disabled={loading}
          >
            <option value="">Seleciona a loja</option>
            {STORE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          {requirePassword && (
            <>
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

              <label htmlFor="confirmar-password">
                Confirmar palavra-passe
              </label>
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
            </>
          )}

          {erro && <p className="force-password-error">{erro}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "A guardar..." : "Guardar e continuar"}
          </button>
        </form>
      </div>
    </div>
  );
}