import {
  runCampaignEndNotificationWorker as runCampaignEndNotificationCycle,
} from "../services/campaign-lifecycle/campaignEndNotificationService.js";

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

let timer = null;
let running = false;

function readBoolean(name, fallback = false) {
  const value = process.env[name];

  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "sim", "on"].includes(
    String(value).trim().toLowerCase(),
  );
}

function readInteger(
  name,
  fallback,
  { min = 1, max = Number.MAX_SAFE_INTEGER } = {},
) {
  const parsed = Number.parseInt(String(process.env[name] || ""), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function getRuntimeConfig() {
  return {
    // Mantém exatamente a mesma flag usada pelo service.
    enabled: readBoolean("CAMPAIGN_END_EMAIL_ENABLED", true),

    // Configuração apenas do scheduler HTTP/Render.
    runOnStart: readBoolean(
      "CAMPAIGN_END_NOTIFICATION_RUN_ON_START",
      false,
    ),

    intervalMs: readInteger(
      "CAMPAIGN_END_NOTIFICATION_INTERVAL_MS",
      DEFAULT_INTERVAL_MS,
      {
        min: 60_000,
        max: 24 * 60 * 60 * 1000,
      },
    ),
  };
}

async function safeRun() {
  if (running) return;

  running = true;

  try {
    // O service atual já representa uma única execução do ciclo.
    const result = await runCampaignEndNotificationCycle();

    const results = Array.isArray(result?.results)
      ? result.results
      : [];

    const sent = results.filter(
      (item) => item?.ok === true && !item?.skipped,
    ).length;

    const failed = results.filter(
      (item) => item?.ok === false,
    ).length;

    if (Number(result?.due || 0) > 0 || results.length > 0 || failed > 0) {
      console.log(
        `[campaign-end] ciclo concluído: devidas=${result?.due || 0} processadas=${results.length} enviadas=${sent} falhas=${failed}.`,
      );
    }
  } catch (error) {
    console.error(
      "[campaign-end] erro no worker:",
      error?.message || error,
    );
  } finally {
    running = false;
  }
}

export function startCampaignEndNotificationWorker() {
  const config = getRuntimeConfig();

  if (!config.enabled) {
    console.log(
      "[campaign-end] notificações desativadas por configuração.",
    );
    return null;
  }

  if (timer) {
    return timer;
  }

  if (config.runOnStart) {
    safeRun();
  }

  timer = setInterval(
    safeRun,
    config.intervalMs,
  );

  timer.unref?.();

  console.log(
    `[campaign-end] worker ativo a cada ${config.intervalMs}ms.`,
  );

  return timer;
}

export function stopCampaignEndNotificationWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
