import "dotenv/config";
import { runCampaignEndNotificationWorker } from "../services/campaign-lifecycle/campaignEndNotificationService.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const dateArg = args.find((value) => value.startsWith("--date="));
const today = dateArg ? dateArg.slice("--date=".length) : "";

try {
  const result = await runCampaignEndNotificationWorker({ dryRun, today });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok && !dryRun) process.exitCode = 1;
} catch (error) {
  console.error("[campaign-end] worker failed:", error?.stack || error?.message || error);
  process.exitCode = 1;
}
