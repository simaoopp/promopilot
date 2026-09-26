import {
  getCampaignEndNotificationConfig,
  runCampaignEndNotificationWorker,
} from "../services/campaign-lifecycle/campaignEndNotificationService.js";

let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const result = await runCampaignEndNotificationWorker();
    if (result.due > 0) {
      console.log("[campaign-end] ciclo concluído", result);
    }
  } catch (error) {
    console.error("[campaign-end] worker falhou:", error?.stack || error);
  } finally {
    running = false;
  }
}

export function startCampaignEndNotificationWorker() {
  const config = getCampaignEndNotificationConfig();
  if (!config.enabled) {
    console.log("[campaign-end] worker desativado (CAMPAIGN_END_WORKER_ENABLED=0).");
    return;
  }

  if (timer) return;

  console.log(`[campaign-end] worker ativo · store=${config.store} · intervalo=${config.intervalMs}ms`);

  if (config.runOnStart) {
    setTimeout(() => void tick(), 2500);
  }

  timer = setInterval(() => void tick(), config.intervalMs);
  timer.unref?.();
}

export function stopCampaignEndNotificationWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}
