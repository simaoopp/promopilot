import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getAutomaticCampaignConfig, hasInboxConfig } from "./config.js";

function messageMatchesSubject(subject = "", includes = []) {
  if (!includes.length) return true;
  const normalizedSubject = String(subject || "").toLowerCase();
  return includes.some((part) => normalizedSubject.includes(String(part).toLowerCase()));
}

function messageMatchesFrom(from = "", expected = "") {
  if (!expected) return true;
  return String(from || "").toLowerCase().includes(String(expected).toLowerCase());
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

function getMessageId(parsed, uid) {
  return String(parsed.messageId || parsed.headers?.get?.("message-id") || `imap-uid-${uid}`).trim();
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
    const lock = await client.getMailboxLock(config.inbox.mailbox);

    try {
      const searchQuery = {};

      if (config.inbox.unseenOnly) searchQuery.seen = false;
      if (config.inbox.seenOnly) searchQuery.seen = true;

      const uids = await client.search(searchQuery);
      const selectedUids = uids.slice(-config.inbox.maxMessages);
      const messages = [];

      for (const uid of selectedUids) {
        const message = await client.fetchOne(uid, { uid: true, envelope: true, source: true, flags: true }, { uid: true });
        if (!message?.source) continue;

        const parsed = await simpleParser(message.source);
        const from = formatAddressList(parsed.from);
        const subject = parsed.subject || message.envelope?.subject || "";

        if (!messageMatchesFrom(from, config.inbox.from)) continue;
        if (!messageMatchesSubject(subject, config.inbox.subjectIncludes)) continue;

        messages.push({
          uid,
          messageId: getMessageId(parsed, uid),
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

      return {
        client,
        lock,
        messages,
        release: async () => {
          lock.release();
          await client.logout();
        },
      };
    } catch (error) {
      lock.release();
      throw error;
    }
  } catch (error) {
    await client.logout().catch(() => {});
    throw error;
  }
}

export async function markEmailAsSeen(client, uid) {
  if (!client || !uid) return;
  await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
}
