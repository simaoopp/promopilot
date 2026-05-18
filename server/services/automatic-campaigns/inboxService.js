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

function formatAddressList(addresses) {
  if (!addresses?.value?.length) return "";
  return addresses.value
    .map((address) => {
      const name = address.name ? `${address.name} ` : "";
      return `${name}<${address.address}>`.trim();
    })
    .join(", ");
}

function getMessageId(parsed, uid, mailbox) {
  return String(parsed.messageId || parsed.headers?.get?.("message-id") || `imap-${mailbox}-uid-${uid}`).trim();
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
  const start = Math.max(1, exists - Number(scanLimit || 100) + 1);
  return `${start}:*`;
}

async function fetchRecentMessages(client, mailbox, config) {
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

    for await (const message of client.fetch(
      range,
      { uid: true, envelope: true, source: true, flags: true },
      { uid: false },
    )) {
      if (!message?.source) continue;
      messages.push(message);
    }

    messages.sort((a, b) => Number(b.uid || 0) - Number(a.uid || 0));
    return messages;
  } finally {
    lock.release();
  }
}

async function fetchMessagesFromMailbox(client, mailbox, config, seenMessageIds) {
  const recentMessages = await fetchRecentMessages(client, mailbox, config);
  const messages = [];
  let parsedCount = 0;
  let skippedSeen = 0;
  let skippedFrom = 0;
  let skippedSubject = 0;
  let skippedDuplicate = 0;

  for (const message of recentMessages) {
    if (messages.length >= config.inbox.maxMessages) break;

    if (!messageMatchesSeenFilter(message, config)) {
      skippedSeen += 1;
      continue;
    }

    const parsed = await simpleParser(message.source);
    parsedCount += 1;
    const from = formatAddressList(parsed.from);
    const subject = parsed.subject || message.envelope?.subject || "";
    const uid = message.uid;
    const messageId = getMessageId(parsed, uid, mailbox);

    if (seenMessageIds.has(messageId)) {
      skippedDuplicate += 1;
      if (config.debug) console.log(`[campanhas-automaticas] Email duplicado ignorado: ${subject}`);
      continue;
    }

    if (!messageMatchesFrom(from, config.inbox.from)) {
      skippedFrom += 1;
      if (config.debug) console.log(`[campanhas-automaticas] Ignorado por remetente: ${from} | ${subject}`);
      continue;
    }

    if (!messageMatchesSubject(subject, config.inbox.subjectIncludes)) {
      skippedSubject += 1;
      if (config.debug) console.log(`[campanhas-automaticas] Ignorado por assunto: ${subject}`);
      continue;
    }

    seenMessageIds.add(messageId);
    messages.push({
      uid,
      mailbox,
      messageId,
      subject,
      from,
      receivedAt:
        parsed.date?.toISOString?.() ||
        message.envelope?.date?.toISOString?.() ||
        new Date().toISOString(),
      text: parsed.text || "",
      html: typeof parsed.html === "string" ? parsed.html : "",
      rawText: parsed.text || "",
      flags: Array.from(message.flags || []),
    });
  }

  if (config.debug) {
    console.log(
      `[campanhas-automaticas] IMAP mailbox="${mailbox}" recentes=${recentMessages.length} parsed=${parsedCount} aceites=${messages.length} ignorados={seen:${skippedSeen}, from:${skippedFrom}, subject:${skippedSubject}, duplicate:${skippedDuplicate}}`,
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
      try {
        const mailboxMessages = await fetchMessagesFromMailbox(client, mailbox, config, seenMessageIds);
        messages.push(...mailboxMessages);
      } catch (error) {
        if (config.debug) {
          console.warn(`[campanhas-automaticas] Falha ao pesquisar mailbox="${mailbox}":`, error?.message || error);
        }
      }
    }

    return {
      client,
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
