import React, { useEffect, useState } from "react";
import { STORE_OPTIONS } from "../../utils/validators";
import {
  inviteUserWithSupabase,
  sendUserPasswordReset,
} from "../../services/userAdminService";

const ROLE_OPTIONS = [
  { value: "user", label: "Utilizador" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Administrador" },
];

export default function UserManagementPanel({ open, onClose }) {
  const [tab, setTab] = useState("invite");

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [store, setStore] = useState("");
  const [role, setRole] = useState("user");

  const [resetEmail, setResetEmail] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    setMessage("");
    setError("");
  }, [open, tab]);

  if (!open) return null;

  function close() {
    if (loading) return;
    setMessage("");
    setError("");
    onClose?.();
  }

  async function handleInvite(event) {
    event.preventDefault();
    setMessage("");
    setError("");

    try {
      setLoading(true);

      const data = await inviteUserWithSupabase({
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        store,
        role,
      });

      setMessage(
        `Convite enviado para ${data?.item?.email || email.trim()}. O utilizador define a palavra-passe através do email do Supabase.`,
      );

      setEmail("");
      setFirstName("");
      setLastName("");
      setStore("");
      setRole("user");
    } catch (inviteError) {
      setError(inviteError?.message || "Não foi possível enviar o convite.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(event) {
    event.preventDefault();
    setMessage("");
    setError("");

    try {
      setLoading(true);
      const data = await sendUserPasswordReset(resetEmail.trim());

      setMessage(
        data?.message ||
          "Pedido enviado. O utilizador receberá um email do Supabase para definir uma nova palavra-passe.",
      );
      setResetEmail("");
    } catch (resetError) {
      setError(
        resetError?.message ||
          "Não foi possível enviar o email para alteração da palavra-passe.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="admin-users-overlay"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <section
        className="admin-users-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-users-title"
      >
        <header className="admin-users-header">
          <div>
            <span className="admin-users-eyebrow">Supabase Auth</span>
            <h2 id="admin-users-title">Gerir utilizadores</h2>
            <p>
              Convites e alteração de palavra-passe são enviados por email
              através do Supabase.
            </p>
          </div>

          <button
            type="button"
            className="admin-users-close"
            onClick={close}
            disabled={loading}
            aria-label="Fechar"
          >
            ×
          </button>
        </header>

        <div className="admin-users-tabs" role="tablist">
          <button
            type="button"
            className={tab === "invite" ? "active" : ""}
            onClick={() => setTab("invite")}
            disabled={loading}
          >
            Convidar utilizador
          </button>

          <button
            type="button"
            className={tab === "password" ? "active" : ""}
            onClick={() => setTab("password")}
            disabled={loading}
          >
            Alterar palavra-passe
          </button>
        </div>

        {tab === "invite" ? (
          <form className="admin-users-form" onSubmit={handleInvite}>
            <div className="admin-users-grid">
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="utilizador@empresa.pt"
                  autoComplete="off"
                  required
                  disabled={loading}
                />
              </label>

              <label>
                <span>Função</span>
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  disabled={loading}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Primeiro nome</span>
                <input
                  type="text"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  required
                  disabled={loading}
                />
              </label>

              <label>
                <span>Último nome</span>
                <input
                  type="text"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  required
                  disabled={loading}
                />
              </label>

              <label className="admin-users-field-full">
                <span>Loja</span>
                <select
                  value={store}
                  onChange={(event) => setStore(event.target.value)}
                  required
                  disabled={loading}
                >
                  <option value="">Seleciona a loja</option>
                  {STORE_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="admin-users-note">
              O Supabase envia o convite. Ao abrir o link, o novo utilizador
              entra no PromoPilot e define a sua própria palavra-passe.
            </div>

            <div className="admin-users-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={close}
                disabled={loading}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? "A enviar..." : "Enviar convite"}
              </button>
            </div>
          </form>
        ) : (
          <form className="admin-users-form" onSubmit={handleReset}>
            <label className="admin-users-field-full">
              <span>Email do utilizador</span>
              <input
                type="email"
                value={resetEmail}
                onChange={(event) => setResetEmail(event.target.value)}
                placeholder="utilizador@empresa.pt"
                autoComplete="off"
                required
                disabled={loading}
              />
            </label>

            <div className="admin-users-note">
              Não definimos a palavra-passe manualmente. O Supabase envia um
              link seguro e o próprio utilizador escolhe a nova palavra-passe.
            </div>

            <div className="admin-users-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={close}
                disabled={loading}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
              >
                {loading ? "A enviar..." : "Enviar link de alteração"}
              </button>
            </div>
          </form>
        )}

        {error && <div className="admin-users-feedback error">{error}</div>}
        {message && (
          <div className="admin-users-feedback success">{message}</div>
        )}
      </section>
    </div>
  );
}
