import React from "react";
import logo from "../../logo.png";

export default function PromoPilotMark({
  compact = false,
  tone = "dark",
  className = "",
}) {
  return (
    <div
      className={`pp-brand-lockup pp-brand-lockup-${tone} ${compact ? "pp-brand-compact" : ""} pp-brand-real-logo ${className}`.trim()}
    >
      <img
        src={logo}
        alt="PromoPilot"
        className={`pp-brand-logo-img ${compact ? "pp-brand-logo-img-compact" : ""}`.trim()}
        draggable="false"
      />
    </div>
  );
}
