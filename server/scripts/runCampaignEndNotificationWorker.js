import "dotenv/config";
import { runCampaignEndNotificationWorker } from "../services/campaign-lifecycle/campaignEndNotificationService.js";

function hasArg(name) {
  return process.argv.slice(2).includes(name);
}

const send = hasArg("--send");
const explicitDryRun = hasArg("--dry-run") || hasArg("--no-send");
const dryRun = explicitDryRun || !send;

try {
  const result = await runCampaignEndNotificationWorker({
    dryRun,
    sendEmails: send && !dryRun,
  });

  console.log("[campaign-end] resultado");
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 0;
} catch (error) {
  console.error("[campaign-end] erro:", error?.stack || error?.message || error);
  process.exitCode = 1;
}
