import React from "react";
import { BRAND } from "../../brand/promopilot";

export function PromoPilotMark({ className = "", size = "md" }) {
  return (
    <span className={`promopilot-mark promopilot-mark-${size} ${className}`.trim()} aria-hidden="true">
      P
    </span>
  );
}

export function PromoPilotWordmark({ compact = false, subtitle = BRAND.supportLine, className = "" }) {
  return (
    <div className={`promopilot-wordmark ${compact ? "promopilot-wordmark-compact" : ""} ${className}`.trim()}>
      <PromoPilotMark size={compact ? "sm" : "md"} />
      <div className="promopilot-wordmark-copy">
        <strong>{BRAND.productName}</strong>
        {!compact && subtitle && <span>{subtitle}</span>}
      </div>
    </div>
  );
}
