import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const ToastContext = createContext(null);

function createToast(id, message, options = {}) {
  return {
    id,
    message,
    type: options.type || "info",
    duration: Number.isFinite(options.duration) ? options.duration : 3500,
  };
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());
  const nextIdRef = useRef(1);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));

    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback((message, options = {}) => {
    const text = String(message || "").trim();
    if (!text) return null;

    const id = nextIdRef.current++;
    const toast = createToast(id, text, options);

    setToasts((prev) => [...prev, toast]);

    if (toast.duration > 0) {
      const timer = window.setTimeout(() => {
        dismissToast(id);
      }, toast.duration);

      timersRef.current.set(id, timer);
    }

    return id;
  }, [dismissToast]);

  const value = useMemo(() => ({
    showToast,
    dismissToast,
    success(message, options = {}) {
      return showToast(message, { ...options, type: "success" });
    },
    error(message, options = {}) {
      return showToast(message, { ...options, type: "error" });
    },
    warning(message, options = {}) {
      return showToast(message, { ...options, type: "warning" });
    },
    info(message, options = {}) {
      return showToast(message, { ...options, type: "info" });
    },
  }), [dismissToast, showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`} role="status">
            <div className="toast-content">
              <span>{toast.message}</span>
            </div>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Fechar notificação"
            >
              ×
            </button>
          </div>
        ))}
      </div>
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
