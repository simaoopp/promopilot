import React from "react";
import PromoPilotMark from "./PromoPilotMark";

export { PromoPilotMark };

export function PromoPilotWordmark({ compact = false, className = "" }) {
  return <PromoPilotMark compact={compact} className={className} />;
}

export default PromoPilotMark;
