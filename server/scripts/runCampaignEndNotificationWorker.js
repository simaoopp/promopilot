import "dotenv/config";
import { runCampaignEndNotificationWorker } from "../services/campaign-lifecycle/campaignEndNotificationService.js";

function readArgs(argv = process.argv.slice(2)) {
  const dryRun = argv.includes("--dry-run");
  const rawLimit = argv.find((arg) => arg.startsWith("--limit="));
  const limit = rawLimit
    ? Number.parseInt(rawLimit.split("=")[1] || "", 10)
    : Number.parseInt(process.env.CAMPAIGN_END_NOTIFICATION_BATCH_SIZE || "50", 10);
  return { dryRun, limit: Number.isFinite(limit) ? limit : 50 };
}

async function main() {
  const options = readArgs();
  console.log(`[campaign-end] start dryRun=${options.dryRun} limit=${options.limit}`);
  const result = await runCampaignEndNotificationWorker(options);
  console.log(JSON.stringify(result, null, 2));
  if (result.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[campaign-end] fatal", error);
  process.exitCode = 1;
});
