import "dotenv/config";
import { runCampaignEndNotificationWorker } from "../services/campaign-lifecycle/campaignEndNotificationService.js";

function getArgValue(prefix) {
  const item = process.argv.slice(2).find((arg) => arg.startsWith(`${prefix}=`));
  return item ? item.slice(prefix.length + 1) : "";
}

const dryRun = process.argv.includes("--dry-run");
const limitRaw = getArgValue("--limit");
const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

try {
  console.log("[campaign-end] Início", {
    dryRun,
    limit: Number.isFinite(limit) ? limit : undefined,
    at: new Date().toISOString(),
  });

  const result = await runCampaignEndNotificationWorker({ dryRun, limit });

  console.log("[campaign-end] Resultado");
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok && !dryRun) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error("[campaign-end] Falha:", error);
  process.exitCode = 1;
}
