import "dotenv/config";
import {
  getCampaignEndNotificationConfig,
  runCampaignEndNotificationWorker,
} from "../services/campaign-lifecycle/campaignEndNotificationService.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const configOnly = args.includes("--config");

try {
  if (configOnly) {
    const config = getCampaignEndNotificationConfig();
    console.log(JSON.stringify({
      ...config,
      // Nunca imprimir segredos neste diagnóstico.
      resendConfigured: config.resendConfigured,
    }, null, 2));
  } else {
    const result = await runCampaignEndNotificationWorker({ dryRun });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok && !dryRun) process.exitCode = 1;
  }
} catch (error) {
  console.error("[campaign-end] worker failed:", error?.stack || error?.message || error);
  process.exitCode = 1;
}
