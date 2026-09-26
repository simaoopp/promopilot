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

    if (result.scanned || result.sent) {
      console.log("[campaign-end] ciclo concluído", {
        scanned: result.scanned,
        sent: result.sent,
        send: result.send,
        ok: result.ok,
      });
    }
  } catch (error) {
    console.error("[campaign-end] erro no ciclo automático:", error?.message || error);
  } finally {
    running = false;
  }
}

export function startCampaignEndNotificationWorker() {
  const config = getCampaignEndNotificationConfig();

  if (!config.enabled) {
    console.log("[campaign-end] worker desativado (CAMPAIGN_END_WORKER_ENABLED=0).");
    return null;
  }

  if (intervalHandle) return intervalHandle;

  console.log("[campaign-end] worker ativo", {
    intervalMs: config.intervalMs,
    batchSize: config.batchSize,
    store: config.storeName,
    sendEnabled: config.sendEnabled,
    resendConfigured: config.resendConfigured,
  });

  // Primeiro ciclo pouco depois do arranque, sem atrasar o boot da API.
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
