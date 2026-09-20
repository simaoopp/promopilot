import {
  getCampaignEndNotificationConfig,
  runCampaignEndNotificationsOnce,
} from "../services/campaign-lifecycle/campaignEndNotificationService.js";

let timer = null;
let running = false;

async function safeRun() {
  if (running) return;
  running = true;

  try {
    const result = await runCampaignEndNotificationsOnce();
    const processed = Array.isArray(result?.processed) ? result.processed : [];
    const sent = processed.filter((item) => item?.ok && !item?.skipped).length;
    const failed = processed.filter((item) => item?.ok === false).length;

    if (processed.length || failed) {
      console.log(
        `[campaign-end] ciclo concluído: devidas=${result?.due || 0} enviadas=${sent} falhas=${failed}.`,
      );
    }
  } catch (error) {
    console.error("[campaign-end] erro no worker:", error?.message || error);
  } finally {
    running = false;
  }
}

export function startCampaignEndNotificationWorker() {
  const config = getCampaignEndNotificationConfig();
  if (!config.enabled) {
    console.log("[campaign-end] notificações desativadas por configuração.");
    return null;
  }

  if (timer) return timer;

  if (config.runOnStart) {
    safeRun();
  }

  timer = setInterval(safeRun, config.intervalMs);
  timer.unref?.();

  console.log(`[campaign-end] worker ativo a cada ${config.intervalMs}ms.`);
  return timer;
}

export function stopCampaignEndNotificationWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
