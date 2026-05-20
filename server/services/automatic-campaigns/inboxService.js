import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getAutomaticCampaignConfig, hasInboxConfig } from "./config.js";

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function messageMatchesSubject(subject = "", includes = []) {
  if (!includes.length) return true;
  const normalizedSubject = normalizeText(subject);
  return includes.some((part) => normalizedSubject.includes(normalizeText(part)));
}

function messageMatchesFrom(from = "", expected = "") {
  if (!expected) return true;
  return normalizeText(from).includes(normalizeText(expected));
}

function formatParsedAddressList(addresses) {
  if (!addresses?.value?.length) return "";
  return addresses.value
    .map((address) => {
      const name = address.name ? `${address.name} ` : "";
      return `${name}<${address.address}>`.trim();
    })
    .join(", ");
}

function formatEnvelopeAddressList(addresses = []) {
  if (!Array.isArray(addresses) || !addresses.length) return "";
  return addresses
    .map((address) => {
      const name = address.name ? `${address.name} ` : "";
      return `${name}<${address.address}>`.trim();
    })
    .join(", ");
}

function getMessageId(parsed, message, mailbox) {
  return String(
    parsed?.messageId ||
      parsed?.headers?.get?.("message-id") ||
      message?.envelope?.messageId ||
      `imap-${mailbox}-uid-${message?.uid}`,
  ).trim();
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function shouldScanMailbox(mailbox) {
  const path = String(mailbox?.path || "");
  const specialUse = String(mailbox?.specialUse || "").toLowerCase();
  const flags = Array.from(mailbox?.flags || []).map((flag) => String(flag).toLowerCase());
  const normalizedPath = normalizeText(path);

  if (!path) return false;
  if (path.toUpperCase() === "INBOX") return true;
  if (specialUse === "\\all" || flags.includes("\\all")) return true;
  if (normalizedPath.includes("all mail")) return true;
  if (normalizedPath.includes("todos")) return true;
  if (normalizedPath.includes("entrada")) return true;
  return false;
}

async function resolveMailboxes(client, config) {
  const explicit = uniqueStrings(config.inbox.mailboxes?.length ? config.inbox.mailboxes : [config.inbox.mailbox]);

  if (!config.inbox.autoDiscoverMailboxes) {
    return explicit;
  }

  try {
    const listed = await client.list();
    const discovered = Array.isArray(listed)
      ? listed.filter(shouldScanMailbox).map((mailbox) => mailbox.path)
      : [];

    if (config.debug) {
      const allPaths = Array.isArray(listed) ? listed.map((mailbox) => mailbox.path).join(" | ") : "";
      console.log(`[campanhas-automaticas] Mailboxes disponíveis: ${allPaths}`);
    }

    return uniqueStrings([...explicit, ...discovered]);
  } catch (error) {
    if (config.debug) {
      console.warn("[campanhas-automaticas] Não foi possível listar mailboxes IMAP:", error?.message || error);
    }
    return explicit;
  }
}

function messageMatchesSeenFilter(message, config) {
  const flags = Array.from(message?.flags || []).map((flag) => String(flag).toLowerCase());
  const isSeen = flags.includes("\\seen");
  if (config.inbox.unseenOnly && isSeen) return false;
  if (config.inbox.seenOnly && !isSeen) return false;
  return true;
}

function buildFetchRange(mailboxExists, scanLimit) {
  const exists = Number(mailboxExists || 0);
  if (!exists || exists < 1) return null;
  const safeScanLimit = Math.max(1, Number(scanLimit || 100));
  const start = Math.max(1, exists - safeScanLimit + 1);
  return `${start}:*`;
}

async function fetchRecentEnvelopeMessages(client, mailbox, config) {
  const lock = await client.getMailboxLock(mailbox);

  try {
    const exists = Number(client.mailbox?.exists || 0);
    const range = buildFetchRange(exists, config.inbox.scanLimit);
    const messages = [];

    if (config.debug) {
      console.log(
        `[campanhas-automaticas] IMAP mailbox="${mailbox}" total=${exists} range=${range || "(vazia)"} scanLimit=${config.inbox.scanLimit}`,
      );
    }

    if (!range) return messages;

    // Importante para Cloud Run/Render: primeiro descarregamos só metadata.
    // O source completo do email só é pedido depois de passar filtros leves.
    for await (const message of client.fetch(
      range,
      { uid: true, envelope: true, flags: true, internalDate: true },
      { uid: false },
    )) {
      messages.push(message);
    }

    messages.sort((a, b) => Number(b.uid || 0) - Number(a.uid || 0));
    return messages;
  } finally {
    lock.release();
  }
}

async function fetchFullMessageSource(client, mailbox, uid) {
  const lock = await client.getMailboxLock(mailbox);

  try {
    return await client.fetchOne(uid, { uid: true, envelope: true, source: true, flags: true, internalDate: true }, { uid: true });
  } finally {
    lock.release();
  }
}

async function fetchMessagesFromMailbox(client, mailbox, config, seenMessageIds, remainingSlots) {
  const recentMessages = await fetchRecentEnvelopeMessages(client, mailbox, config);
  const messages = [];
  let fetchedSourceCount = 0;
  let parsedCount = 0;
  let skippedSeen = 0;
  let skippedFrom = 0;
  let skippedSubject = 0;
  let skippedDuplicate = 0;
  let skippedNoSource = 0;

  for (const message of recentMessages) {
    if (messages.length >= remainingSlots) break;

    if (!messageMatchesSeenFilter(message, config)) {
      skippedSeen += 1;
      continue;
    }

    const envelopeSubject = message.envelope?.subject || "";
    const envelopeFrom = formatEnvelopeAddressList(message.envelope?.from || []);
    const envelopeMessageId = String(message.envelope?.messageId || `imap-${mailbox}-uid-${message.uid}`).trim();

    if (seenMessageIds.has(envelopeMessageId)) {
      skippedDuplicate += 1;
      if (config.debug) console.log(`[campanhas-automaticas] Email duplicado ignorado: ${envelopeSubject}`);
      continue;
    }

    if (!messageMatchesFrom(envelopeFrom, config.inbox.from)) {
      skippedFrom += 1;
      if (config.debug) console.log(`[campanhas-automaticas] Ignorado por remetente: ${envelopeFrom} | ${envelopeSubject}`);
      continue;
    }

    if (!messageMatchesSubject(envelopeSubject, config.inbox.subjectIncludes)) {
      skippedSubject += 1;
      if (config.debug) console.log(`[campanhas-automaticas] Ignorado por assunto: ${envelopeSubject}`);
      continue;
    }

    const fullMessage = await fetchFullMessageSource(client, mailbox, message.uid);
    fetchedSourceCount += 1;

    if (!fullMessage?.source) {
      skippedNoSource += 1;
      continue;
    }

    const parsed = await simpleParser(fullMessage.source);
    parsedCount += 1;

    const from = formatParsedAddressList(parsed.from) || envelopeFrom;
    const subject = parsed.subject || envelopeSubject;
    const messageId = getMessageId(parsed, fullMessage, mailbox);

    if (seenMessageIds.has(messageId)) {
      skippedDuplicate += 1;
      if (config.debug) console.log(`[campanhas-automaticas] Email duplicado ignorado após parse: ${subject}`);
      continue;
    }

    seenMessageIds.add(envelopeMessageId);
    seenMessageIds.add(messageId);

    messages.push({
      uid: message.uid,
      mailbox,
      messageId,
      subject,
      from,
      receivedAt:
        parsed.date?.toISOString?.() ||
        fullMessage.envelope?.date?.toISOString?.() ||
        fullMessage.internalDate?.toISOString?.() ||
        new Date().toISOString(),
      text: parsed.text || "",
      html: typeof parsed.html === "string" ? parsed.html : "",
      rawText: parsed.text || "",
      flags: Array.from(fullMessage.flags || message.flags || []),
    });
  }

  if (config.debug) {
    console.log(
      `[campanhas-automaticas] IMAP mailbox="${mailbox}" recentes=${recentMessages.length} source=${fetchedSourceCount} parsed=${parsedCount} aceites=${messages.length} ignorados={seen:${skippedSeen}, from:${skippedFrom}, subject:${skippedSubject}, duplicate:${skippedDuplicate}, noSource:${skippedNoSource}}`,
    );
  }

  return messages;
}

export async function fetchAutomaticCampaignEmails() {
  const config = getAutomaticCampaignConfig();

  if (!hasInboxConfig(config)) {
    throw new Error("IMAP não configurado. Define CAMPAIGN_IMAP_HOST, CAMPAIGN_IMAP_USER e CAMPAIGN_IMAP_PASS.");
  }

  const client = new ImapFlow({
    host: config.inbox.host,
    port: config.inbox.port,
    secure: config.inbox.secure,
    auth: {
      user: config.inbox.user,
      pass: config.inbox.pass,
    },
    logger: false,
  });

  await client.connect();

  try {
    const mailboxes = await resolveMailboxes(client, config);
    const messages = [];
    const seenMessageIds = new Set();

    if (config.debug) {
      console.log(`[campanhas-automaticas] IMAP user=${config.inbox.user} mailboxes=${mailboxes.join(", ")}`);
      console.log(
        `[campanhas-automaticas] filtros: unseenOnly=${config.inbox.unseenOnly} seenOnly=${config.inbox.seenOnly} subject=${config.inbox.subjectIncludes.join("|") || "(sem filtro)"} from=${config.inbox.from || "(sem filtro)"} max=${config.inbox.maxMessages}`,
      );
    }

    for (const mailbox of mailboxes) {
      if (messages.length >= config.inbox.maxMessages) break;

      try {
        const remainingSlots = Math.max(0, config.inbox.maxMessages - messages.length);
        const mailboxMessages = await fetchMessagesFromMailbox(client, mailbox, config, seenMessageIds, remainingSlots);
        messages.push(...mailboxMessages);
      } catch (error) {
        if (config.debug) {
          console.warn(`[campanhas-automaticas] Falha ao pesquisar mailbox="${mailbox}":`, error?.message || error);
        }
      }
    }

    return {
      client,
      mailboxes,
      messages,
      release: async () => {
        await client.logout();
      },
    };
  } catch (error) {
    await client.logout().catch(() => {});
    throw error;
  }
}

export async function markEmailAsSeen(client, uid, mailbox = "INBOX") {
  if (!client || !uid) return;

  const lock = await client.getMailboxLock(mailbox);
  try {
    await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
  } finally {
    lock.release();
  }
}
