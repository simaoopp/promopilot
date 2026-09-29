import {
  getCampaignEndNotificationConfig,
  runCampaignEndNotificationWorkerOnce,
} from "../services/campaign-lifecycle/campaignEndNotificationService.js";

let intervalHandle = null;
let startupHandle = null;
let running = false;

async function tick() {
  if (running) {
    console.warn("[campaign-end] Execução anterior ainda ativa; ciclo ignorado.");
    return;
  }

  running = true;
  try {
    const result = await runCampaignEndNotificationWorkerOnce();
    console.log("[campaign-end] ciclo concluído", {
      scanned: result.scanned || 0,
      sent: result.sent || 0,
      failed: result.failed || 0,
      waitingRecipients: result.waitingRecipients || 0,
      ok: result.ok,
      skipped: result.skipped || false,
    });
  } catch (error) {
    console.error("[campaign-end] erro no ciclo automático:", error?.stack || error?.message || error);
  } finally {
    running = false;
  }
}

export function startCampaignEndNotificationWorker() {
  const config = getCampaignEndNotificationConfig();

  if (!config.runInApi || !config.workerEnabled) {
    console.log("[campaign-end] worker interno da API desativado; usar Cloud Run Job/Scheduler.");
    return null;
  }

  if (!config.emailEnabled) {
    console.log("[campaign-end] envio desativado (CAMPAIGN_END_EMAIL_ENABLED=0).");
    return null;
  }

  if (intervalHandle) return intervalHandle;

  console.log("[campaign-end] worker interno ativo", {
    intervalMs: config.intervalMs,
    batchSize: config.batchSize,
    store: config.storeName,
    sendEnabled: config.sendEnabled,
    resendConfigured: config.resendConfigured,
  });

  startupHandle = setTimeout(() => {
    startupHandle = null;
    tick();
  }, 10_000);
  startupHandle.unref?.();

  intervalHandle = setInterval(tick, config.intervalMs);
  intervalHandle.unref?.();

  return intervalHandle;
}

export function stopCampaignEndNotificationWorker() {
  if (startupHandle) clearTimeout(startupHandle);
  if (intervalHandle) clearInterval(intervalHandle);
  startupHandle = null;
  intervalHandle = null;
}
