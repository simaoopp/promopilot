import "dotenv/config";
import { runCampaignEmailWorkerOnce } from "../workers/campaignEmailWorker.js";

function hasArg(name) {
  return process.argv.slice(2).includes(name);
}

const dryRun = hasArg("--dry-run");
const force = hasArg("--force");
const send = hasArg("--send");
const noSend = hasArg("--no-send");

const options = {
  dryRun,
  force,
};

// Regra profissional para Cloud Run:
// - --send força envio real.
// - --no-send ou --dry-run força não enviar.
// - sem flag usa CAMPAIGN_EMAIL_SEND_ENABLED do ambiente.
if (send) {
  options.sendEmails = true;
}

if (noSend || dryRun) {
  options.sendEmails = false;
}

try {
  console.log("[campaign-worker] Execução one-shot iniciada.", {
    dryRun,
    force,
    sendEmailsOverride: options.sendEmails === undefined ? "env" : options.sendEmails,
  });

  const result = await runCampaignEmailWorkerOnce(options);

  console.log("[campaign-worker] Execução one-shot concluída.");
  console.log(JSON.stringify(result, null, 2));

  process.exit(0);
} catch (error) {
  console.error("[campaign-worker] Falha na execução one-shot:", error);
  process.exit(1);
}
