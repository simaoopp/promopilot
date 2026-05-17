import "dotenv/config";
import { runCampaignEmailWorkerOnce } from "../workers/campaignEmailWorker.js";

try {
  const result = await runCampaignEmailWorkerOnce({
    dryRun: process.argv.includes("--dry-run"),
    force: process.argv.includes("--force"),
    sendEmails: process.argv.includes("--send"),
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
