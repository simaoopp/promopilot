import "dotenv/config";
import { runCampaignEndNotificationWorkerOnce } from "../services/campaign-lifecycle/campaignEndNotificationService.js";

function hasFlag(name) {
  return process.argv.includes(name);
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return "";
  return String(process.argv[index + 1] || "").trim();
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const explicitSend = hasFlag("--send");
  const limitRaw = readOption("--limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  if (!dryRun && !explicitSend) {
    console.error(
      "Escolhe um modo seguro: --dry-run para validar ou --send para enviar notificações.",
    );
    process.exitCode = 2;
    return;
  }

  const result = await runCampaignEndNotificationWorkerOnce({
    dryRun,
    send: explicitSend,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[campaign-end] Falha fatal no worker:", error);
  process.exitCode = 1;
});
