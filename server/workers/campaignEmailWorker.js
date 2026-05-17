import { getAutomaticCampaignConfig, hasInboxConfig } from "../services/automatic-campaigns/config.js";
import { fetchAutomaticCampaignEmails, markEmailAsSeen } from "../services/automatic-campaigns/inboxService.js";
import { processAutomaticCampaignEmail } from "../services/automatic-campaigns/automaticCampaignProcessor.js";

let timer = null;
let running = false;

export async function runCampaignEmailWorkerOnce(options = {}) {
  const config = getAutomaticCampaignConfig();

  if (!hasInboxConfig(config)) {
    throw new Error("Worker de campanhas automáticas sem configuração IMAP.");
  }

  const session = await fetchAutomaticCampaignEmails();
  const processed = [];

  try {
    for (const email of session.messages) {
      const result = await processAutomaticCampaignEmail(email, {
        sendEmails: options.sendEmails ?? config.sendEmails,
        dryRun: options.dryRun || false,
        force: options.force || false,
      });

      processed.push(result);

      if (config.markSeen && !options.dryRun) {
        await markEmailAsSeen(session.client, email.uid);
      }
    }
  } finally {
    await session.release();
  }

  return {
    ok: true,
    total: processed.length,
    processed,
  };
}

async function safeRun() {
  if (running) return;
  running = true;

  try {
    const result = await runCampaignEmailWorkerOnce();
    console.log(`[campanhas-automaticas] Worker concluído: ${result.total} email(s) processado(s).`);
  } catch (error) {
    console.error("[campanhas-automaticas] Erro no worker:", error);
  } finally {
    running = false;
  }
}

export function startCampaignEmailWorker() {
  const config = getAutomaticCampaignConfig();

  if (!config.enabled) {
    return null;
  }

  if (!hasInboxConfig(config)) {
    console.warn("[campanhas-automaticas] Worker ativado, mas IMAP não está configurado.");
    return null;
  }

  if (timer) return timer;

  if (config.runOnStart) {
    safeRun();
  }

  timer = setInterval(safeRun, config.intervalMs);
  timer.unref?.();

  console.log(`[campanhas-automaticas] Worker ativo a cada ${config.intervalMs}ms.`);
  return timer;
}

export function stopCampaignEmailWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
