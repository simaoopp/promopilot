import React from "react";
import "../styles/app-loading.css";

export default function AppLoading({ message = "A preparar o seu espaço de trabalho…" }) {
  return (
    <div className="pp-loading-screen" role="status" aria-live="polite" aria-busy="true">
      <div className="pp-loading-content">
        <span className="pp-loading-caption">O SEU DIA, ORGANIZADO.</span>
        <div className="pp-loading-wordmark" aria-label="PromoPilot">Promo<span>Pilot</span><i aria-hidden="true" /></div>
        <div className="pp-loading-track" aria-hidden="true"><span /></div>
        <p>{message}</p>
      </div>
    </div>
  );
}
