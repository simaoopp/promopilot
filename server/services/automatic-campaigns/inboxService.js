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

    return uniqueStrings([...explicit, ...discovered]);
  } catch (error) {
    if (config.debug) {
      console.warn("[campanhas-automaticas] Não foi possível listar mailboxes IMAP:", error?.message || error);
    }
    return explicit;
  }
}

function buildSearchQuery(config) {
  const searchQuery = {};
  if (config.inbox.unseenOnly) searchQuery.seen = false;
  if (config.inbox.seenOnly) searchQuery.seen = true;
  return searchQuery;
}

async function fetchMessagesFromMailbox(client, mailbox, config, seenMessageIds) {
  const lock = await client.getMailboxLock(mailbox);

  try {
    const searchQuery = buildSearchQuery(config);
    const uids = await client.search(searchQuery);
    const selectedUids = uids.slice(-config.inbox.maxMessages);
    const messages = [];

    if (config.debug) {
      console.log(
        `[campanhas-automaticas] IMAP mailbox="${mailbox}" encontrados=${uids.length} analisados=${selectedUids.length} filtroSeen=${JSON.stringify(searchQuery)}`,
      );
    }

    for (const uid of selectedUids) {
      const message = await client.fetchOne(
        uid,
        { uid: true, envelope: true, source: true, flags: true },
        { uid: true },
      );
      if (!message?.source) continue;

      const parsed = await simpleParser(message.source);
      const from = formatAddressList(parsed.from);
      const subject = parsed.subject || message.envelope?.subject || "";
      const messageId = getMessageId(parsed, uid, mailbox);

      if (seenMessageIds.has(messageId)) {
        if (config.debug) console.log(`[campanhas-automaticas] Email duplicado ignorado: ${subject}`);
        continue;
      }

      if (!messageMatchesFrom(from, config.inbox.from)) {
        if (config.debug) console.log(`[campanhas-automaticas] Ignorado por remetente: ${from} | ${subject}`);
        continue;
      }

      if (!messageMatchesSubject(subject, config.inbox.subjectIncludes)) {
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

    return messages;
  } finally {
    lock.release();
  }
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
        `[campanhas-automaticas] filtros: unseenOnly=${config.inbox.unseenOnly} seenOnly=${config.inbox.seenOnly} subject=${config.inbox.subjectIncludes.join("|") || "(sem filtro)"} from=${config.inbox.from || "(sem filtro)"}`,
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
