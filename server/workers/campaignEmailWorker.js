import { getAutomaticCampaignConfig, hasInboxConfig } from "../services/automatic-campaigns/config.js";
import { fetchAutomaticCampaignEmails, markEmailAsSeen } from "../services/automatic-campaigns/inboxService.js";
import { processAutomaticCampaignEmail } from "../services/automatic-campaigns/automaticCampaignProcessor.js";
import { cleanupExpiredAutomaticCampaigns } from "../services/automatic-campaigns/cleanupService.js";

let timer = null;
let running = false;

function summarizeStoreResults(result) {
  return (result?.results || [])
    .filter((storeResult) => !storeResult.skipped)
    .map((storeResult) => `${storeResult.store}:${storeResult.status || "ok"}`)
    .join(", ");
}

export async function runCampaignEmailWorkerOnce(options = {}) {
  const config = getAutomaticCampaignConfig();

  if (!hasInboxConfig(config)) {
    if (config.inbound?.resendEnabled) {
      return {
        ok: true,
        skipped: true,
        reason: "Modo Resend Inbound ativo. O processamento é acionado por webhook, não por IMAP.",
        total: 0,
        errors: [],
        processed: [],
      };
    }

    throw new Error("Worker de campanhas automáticas sem configuração IMAP.");
  }

  let cleanup = null;

  if (config.cleanup?.enabled && !options.dryRun) {
    try {
      cleanup = await cleanupExpiredAutomaticCampaigns({ config });
      if (cleanup.matchedRows > 0) {
        console.log(
          `[campanhas-automaticas] Limpeza automática: ${cleanup.deletedRows}/${cleanup.matchedRows} campanha(s) removida(s), ${cleanup.deletedPdfPaths} PDF(s) removido(s), limite=${cleanup.maxAgeDays} dias.`,
        );
      }
    } catch (error) {
      cleanup = { ok: false, error: error?.message || String(error) };
      console.warn("[campanhas-automaticas] Limpeza automática falhou sem bloquear o worker:", cleanup.error);
    }
  }

  const session = await fetchAutomaticCampaignEmails();
  const processed = [];
  const errors = [];

  try {
    for (const email of session.messages) {
      try {
        const result = await processAutomaticCampaignEmail(email, {
          sendEmails: options.sendEmails ?? config.sendEmails,
          dryRun: Boolean(options.dryRun),
          force: Boolean(options.force),
        });

        processed.push(result);

        const storeErrors = (result?.results || []).filter(
          (storeResult) => storeResult?.status === "error" || storeResult?.error,
        );

        if (config.markSeen && !options.dryRun && storeErrors.length === 0) {
          await markEmailAsSeen(session.client, email.uid, email.mailbox);
        } else if (config.markSeen && !options.dryRun && storeErrors.length > 0) {
          console.warn(
            `[campanhas-automaticas] Email não marcado como lido porque houve ${storeErrors.length} erro(s) no processamento: ${email.subject}`,
          );
        }
      } catch (error) {
        errors.push({
          messageId: email.messageId,
          subject: email.subject,
          mailbox: email.mailbox,
          uid: email.uid,
          error: error?.message || String(error),
        });
      }
    }
  } finally {
    await session.release();
  }

  return {
    ok: errors.length === 0,
    dryRun: Boolean(options.dryRun),
    sendEmails: Boolean(options.sendEmails ?? config.sendEmails),
    scannedMailboxes: session.mailboxes || [],
    cleanup,
    total: processed.length,
    errors,
    processed,
  };
}

async function safeRun() {
  if (running) return;
  running = true;

  try {
    const result = await runCampaignEmailWorkerOnce();
    const lojas = result.processed.map(summarizeStoreResults).filter(Boolean).join(" | ");
    console.log(
      `[campanhas-automaticas] Worker concluído: ${result.total} email(s) processado(s)` +
        `${result.errors?.length ? ` | erros=${result.errors.length}` : ""}` +
        `${lojas ? ` | ${lojas}` : ""}.`,
    );
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
    if (config.inbound?.resendEnabled) {
      console.log("[campanhas-automaticas] Resend Inbound ativo; worker IMAP permanente não será iniciado.");
      return null;
    }

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
