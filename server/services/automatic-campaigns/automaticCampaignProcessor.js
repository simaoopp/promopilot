import { automaticCampaignStores, getAutomaticCampaignConfig } from "./config.js";
import { parseAutomaticCampaignEmail } from "./campaignEmailParser.js";
import { splitAutomaticCampaignByStore } from "./storeSplitterService.js";
import { generateAutomaticCampaignPdf } from "./pdfGeneratorService.js";
import { uploadAutomaticCampaignPdf } from "./storageService.js";
import { sendAutomaticCampaignEmail } from "./emailSenderService.js";
import { applyAutomaticFormatRulesToItems, countAutomaticFormats, normalizeCampaignFormat } from "./formatRulesService.js";
import { filterAutomaticCampaignDiscountItems } from "./priceRulesService.js";
import {
  getCampaignArticleCodes,
  splitCampaignItemsByPromotionInfo,
} from "../../../src/shared/campaign-label/promotionInfoRules.js";
import {
  buildAutomaticCampaignRow,
  findAutomaticCampaignDuplicate,
  updateAutomaticCampaignRow,
  upsertAutomaticCampaignRow,
} from "./automaticCampaignRepository.js";

function normalizeEmailInput(email = {}) {
  const now = new Date().toISOString();
  const messageId = String(email.messageId || email.email_message_id || email.id || `manual-${Date.now()}`).trim();

  return {
    messageId,
    uid: email.uid,
    subject: email.subject || email.emailSubject || "Campanha automática",
    from: email.from || email.emailFrom || "",
    receivedAt: email.receivedAt || email.emailReceivedAt || now,
    text: email.text || email.body || "",
    html: email.html || "",
    rawText: email.rawText || email.text || email.body || "",
  };
}

function buildPdfFilename(storeKey, subject) {
  const safeSubject = String(subject || "campanha")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);

  return `etiquetas-${storeKey}-${safeSubject || "campanha"}.pdf`;
}

export async function processAutomaticCampaignEmail(emailInput = {}, options = {}) {
  const config = getAutomaticCampaignConfig();
  const email = normalizeEmailInput(emailInput);
  const sendEmails = Boolean(options.sendEmails ?? config.sendEmails);
  const dryRun = Boolean(options.dryRun);
  const format = normalizeCampaignFormat(options.format || config.defaultFormat);
  const title = options.title || config.defaultTitle || "PROMOÇÃO";
  const keepDays = Number.isFinite(options.keepDays) ? options.keepDays : config.keepDays;
  const organizationId = options.organizationId || config.defaultOrganizationId || null;

  const parsed = parseAutomaticCampaignEmail({
    text: email.text,
    html: email.html,
    subject: email.subject,
  });

  const historyTitle = config.titleFromEmail ? (parsed?.title || email.subject || title) : title;
  const { printableCandidates, pvpUpdateItems } = splitCampaignItemsByPromotionInfo(parsed.rows);
  const printableRows = filterAutomaticCampaignDiscountItems(printableCandidates);
  const ignoredPriceRows = printableCandidates.length - printableRows.length;
  const ignoredRows = ignoredPriceRows + pvpUpdateItems.length;
  const itemsByStore = splitAutomaticCampaignByStore(printableRows);
  const pvpUpdateItemsByStore = splitAutomaticCampaignByStore(pvpUpdateItems);
  const results = [];

  for (const store of Object.values(automaticCampaignStores)) {
    const items = applyAutomaticFormatRulesToItems(itemsByStore[store.key] || [], format);
    const pvpUpdateStoreItems = pvpUpdateItemsByStore[store.key] || [];
    const pvpUpdateCodes = getCampaignArticleCodes(pvpUpdateStoreItems);
    const formatCounts = countAutomaticFormats(items);

    if (!items.length && !pvpUpdateCodes.length) {
      results.push({
        storeKey: store.key,
        store: store.store,
        totalItems: 0,
        pvpUpdateCodes: [],
        formatCounts,
        skipped: true,
        reason: "Sem artigos para esta loja.",
      });
      continue;
    }

    const existing = dryRun || !config.dedupeEnabled
      ? null
      : await findAutomaticCampaignDuplicate({
          emailMessageId: email.messageId,
          emailSubject: email.subject,
          store: store.store,
          dedupeBySubject: config.dedupeBySubject,
          organizationId,
        });

    const canReprocessExistingError = existing?.status === "error" && config.reprocessErroredCampaigns;

    if (existing && !options.force && !canReprocessExistingError) {
      results.push({
        storeKey: store.key,
        store: store.store,
        totalItems: items.length,
        formatCounts,
        skipped: true,
        reason: "Email já processado para esta loja.",
        existingId: existing.id,
      });
      continue;
    }

    const rowId = existing?.id || `auto-${email.messageId.replace(/[^a-zA-Z0-9._-]+/g, "-")}-${store.key}`;
    const initialRow = buildAutomaticCampaignRow({
      id: rowId,
      title: historyTitle,
      items,
      store,
      storeKey: store.key,
      format,
      email,
      status: dryRun ? "processed" : "processing",
      keepDays,
      organizationId,
    });

    let savedRow = dryRun ? initialRow : await upsertAutomaticCampaignRow(initialRow);

    try {
      const pdfBuffer = items.length
        ? await generateAutomaticCampaignPdf({
            items,
            title,
            storeLabel: store.label,
            format,
            anoValidade: new Date().getFullYear(),
          })
        : null;

      let pdfInfo = { path: "", signedUrl: "" };

      if (!dryRun && pdfBuffer) {
        pdfInfo = await uploadAutomaticCampaignPdf({
          pdfBuffer,
          emailMessageId: email.messageId,
          storeKey: store.key,
          title,
          organizationId,
        });
      }

      let mailResult = null;
      let status = "processed";
      let emailSentAt = null;

      if (sendEmails && !dryRun) {
        mailResult = await sendAutomaticCampaignEmail({
          to: store.email,
          storeLabel: store.label,
          pdfBuffer,
          filename: pdfBuffer ? buildPdfFilename(store.key, email.subject) : "",
          totalItems: items.length,
          subject: email.subject,
          pvpUpdateCodes,
        });
        status = "sent";
        emailSentAt = new Date().toISOString();
      }

      const pdfs = {
        [store.store]: pdfInfo.signedUrl || "",
        [`${store.key}Path`]: pdfInfo.path || "",
        [`${store.key}Bucket`]: pdfInfo.bucket || "",
        [`${store.key}EmailTo`]: store.email || "",
        [`${store.key}EmailSentAt`]: emailSentAt,
        pvpUpdateCodes: pvpUpdateCodes.join("|"),
        pvpUpdateTotal: pvpUpdateCodes.length,
      };

      const patch = {
        status,
        pdf_url: pdfInfo.signedUrl || "",
        pdfs,
        error_message: "",
        processed_at: new Date().toISOString(),
      };

      if (!dryRun) {
        savedRow = await updateAutomaticCampaignRow(savedRow.id, patch);
      } else {
        savedRow = { ...savedRow, ...patch };
      }

      results.push({
        storeKey: store.key,
        store: store.store,
        totalItems: items.length,
        pvpUpdateCodes,
        formatCounts,
        status,
        pdfPath: pdfInfo.path,
        pdfUrl: pdfInfo.signedUrl,
        emailTo: store.email,
        emailSent: Boolean(mailResult),
        row: savedRow,
      });
    } catch (error) {
      const patch = {
        status: "error",
        error_message: error?.message || "Erro ao processar campanha automática.",
        processed_at: new Date().toISOString(),
      };

      if (!dryRun) {
        savedRow = await updateAutomaticCampaignRow(savedRow.id, patch).catch(() => ({ ...savedRow, ...patch }));
      } else {
        savedRow = { ...savedRow, ...patch };
      }

      results.push({
        storeKey: store.key,
        store: store.store,
        totalItems: items.length,
        pvpUpdateCodes,
        formatCounts,
        status: "error",
        error: patch.error_message,
        row: savedRow,
      });
    }
  }

  return {
    ok: true,
    dryRun,
    sendEmails,
    format,
    email: {
      messageId: email.messageId,
      subject: email.subject,
      from: email.from,
      receivedAt: email.receivedAt,
    },
    parsed: {
      totalItems: parsed.totalItems,
      title: parsed.title,
      subjectDate: parsed.subjectDate,
      printableItems: printableRows.length,
      ignoredItems: ignoredRows,
      ignoredPvpUpdateItems: pvpUpdateItems.length,
      ignoredPriceItems: ignoredPriceRows,
    },
    results,
  };
}
