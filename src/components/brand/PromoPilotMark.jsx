import React from "react";
import { PROMOPILOT_BRAND } from "../../brand/promopilot";

export default function PromoPilotMark({
  compact = false,
  tone = "dark",
  className = "",
}) {
  return (
    <div className={`pp-brand-lockup pp-brand-lockup-${tone} ${compact ? "pp-brand-compact" : ""} ${className}`.trim()}>
      <div className="pp-brand-mark" aria-hidden="true">
        <span className="pp-brand-mark-dot" />
        <strong>PP</strong>
      </div>

      {!compact && (
        <div className="pp-brand-copy">
          <span className="pp-brand-name">{PROMOPILOT_BRAND.appName}</span>
          <span className="pp-brand-descriptor">{PROMOPILOT_BRAND.descriptor}</span>
        </div>
      )}
    </div>
  );
}
