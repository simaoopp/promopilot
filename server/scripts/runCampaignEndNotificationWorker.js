import "dotenv/config";
import { runCampaignEndNotificationWorker } from "../services/campaign-lifecycle/campaignEndNotificationService.js";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run") || args.has("--no-send");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : undefined;

try {
  const result = await runCampaignEndNotificationWorker({ dryRun, limit });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("[campaign-end] execução falhou:", error?.stack || error);
  process.exitCode = 1;
}
