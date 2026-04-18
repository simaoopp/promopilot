import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const ToastContext = createContext(null);
const TOAST_DURATION_MS = 4200;

function ToastViewport({ toasts, onClose }) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.variant}`}
          role="status"
        >
          <div className="toast-content">
            <strong>{toast.title}</strong>
            {toast.description ? <p>{toast.description}</p> : null}
          </div>
          <button
            type="button"
            className="toast-close"
            onClick={() => onClose(toast.id)}
            aria-label="Fechar notificação"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(({ title, description = "", variant = "info" }) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setToasts((prev) => [...prev, { id, title, description, variant }]);
    window.setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
  }, [dismissToast]);

  const value = useMemo(
    () => ({
      showSuccess(title, description = "") {
        pushToast({ title, description, variant: "success" });
      },
      showError(title, description = "") {
        pushToast({ title, description, variant: "error" });
      },
      showInfo(title, description = "") {
        pushToast({ title, description, variant: "info" });
      },
      dismissToast,
    }),
    [dismissToast, pushToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onClose={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast deve ser usado dentro de ToastProvider.");
  }

  return context;
}
