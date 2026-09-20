import "dotenv/config";
import { runCampaignEndNotificationWorker } from "../services/campaign-lifecycle/campaignEndNotificationService.js";

function readArgValue(name, fallback = "") {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => String(arg).startsWith(prefix));
  return match ? String(match).slice(prefix.length) : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

async function main() {
  const explicitDryRun = hasArg("--dry-run");
  const explicitSend = hasArg("--send");
  const sendEnabled = ["1", "true", "yes", "sim", "on"].includes(
    String(process.env.CAMPAIGN_END_EMAIL_SEND_ENABLED || "").trim().toLowerCase(),
  );

  const dryRun = explicitDryRun || (!explicitSend && !sendEnabled);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(readArgValue("--limit", "20"), 10) || 20),
  );

  console.log("[campaign-end] Worker iniciado.", {
    dryRun,
    limit,
    timeZone: "Atlantic/Azores",
  });

  const result = await runCampaignEndNotificationWorker({
    dryRun,
    limit,
  });

  console.log("[campaign-end] Worker concluído.", result);
}

main().catch((error) => {
  console.error("[campaign-end] Worker falhou:", error);
  process.exitCode = 1;
});
