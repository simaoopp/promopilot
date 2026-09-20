const DEFAULT_TIME_ZONE = "Atlantic/Azores";
export const DEFAULT_CAMPAIGN_HISTORY_RETENTION_DAYS = 30;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function safeYear(value, fallback = new Date().getFullYear()) {
  const year = Number.parseInt(value, 10);
  return Number.isFinite(year) && year >= 2000 && year <= 2200 ? year : fallback;
}

function validYmd(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseCampaignDate(value, fallbackYear, createdAt = null) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  let year = null;
  let month = null;
  let day = null;
  let explicitYear = false;

  let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\D|$)/);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
    explicitYear = true;
  } else {
    match = raw.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?(?:\D|$)/);
    if (!match) return null;

    day = Number(match[1]);
    month = Number(match[2]);

    if (match[3]) {
      year = Number(match[3]);
      if (year < 100) year += 2000;
      explicitYear = true;
    } else {
      const created = createdAt ? new Date(createdAt) : new Date();
      const createdYear = Number.isFinite(created.getTime())
        ? created.getUTCFullYear()
        : new Date().getUTCFullYear();
      year = safeYear(fallbackYear, createdYear);

      // Campanhas criadas no final do ano podem terminar em janeiro/fevereiro
      // mesmo quando o ficheiro só traz DD/MM.
      if (Number.isFinite(created.getTime())) {
        const createdMonth = created.getUTCMonth() + 1;
        const candidate = Date.UTC(year, month - 1, day);
        const createdDay = Date.UTC(
          created.getUTCFullYear(),
          created.getUTCMonth(),
          created.getUTCDate(),
        );

        if (
          candidate < createdDay &&
          createdMonth >= 10 &&
          month <= 3 &&
          year <= created.getUTCFullYear()
        ) {
          year = created.getUTCFullYear() + 1;
        }
      }
    }
  }

  if (!validYmd(year, month, day)) return null;

  return {
    year,
    month,
    day,
    explicitYear,
    isoDate: `${year}-${pad2(month)}-${pad2(day)}`,
  };
}

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  return formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = Number(part.value);
    return acc;
  }, {});
}

export function zonedDateTimeToUtc({
  year,
  month,
  day,
  hour = 23,
  minute = 59,
  second = 59,
  timeZone = DEFAULT_TIME_ZONE,
}) {
  const nominalUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = nominalUtc;

  // Duas iterações cobrem alterações de offset/DST sem dependências externas.
  for (let i = 0; i < 2; i += 1) {
    const parts = getZonedParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const offset = asUtc - guess;
    guess = nominalUtc - offset;
  }

  return new Date(guess);
}

export function deriveCampaignEndAt({
  items = [],
  anoValidade,
  createdAt = null,
  timeZone = DEFAULT_TIME_ZONE,
} = {}) {
  const rows = Array.isArray(items) ? items : [];
  const parsedDates = rows
    .map((item) =>
      parseCampaignDate(
        item?.dataFim ?? item?.data_fim ?? item?.endDate ?? item?.end_date,
        anoValidade,
        createdAt,
      ),
    )
    .filter(Boolean);

  if (!parsedDates.length) return null;

  parsedDates.sort((a, b) => {
    const aa = Date.UTC(a.year, a.month - 1, a.day);
    const bb = Date.UTC(b.year, b.month - 1, b.day);
    return aa - bb;
  });

  const last = parsedDates[parsedDates.length - 1];
  return zonedDateTimeToUtc({
    ...last,
    hour: 23,
    minute: 59,
    second: 59,
    timeZone,
  }).toISOString();
}

export function campaignRetentionExpiry({
  campaignEndAt,
  createdAt = null,
  retentionDays = DEFAULT_CAMPAIGN_HISTORY_RETENTION_DAYS,
  fallbackDays = 2,
} = {}) {
  const end = campaignEndAt ? new Date(campaignEndAt) : null;
  const base = end && Number.isFinite(end.getTime())
    ? end
    : createdAt && Number.isFinite(new Date(createdAt).getTime())
      ? new Date(createdAt)
      : new Date();

  const days = end && Number.isFinite(end.getTime())
    ? Math.max(1, Number(retentionDays) || DEFAULT_CAMPAIGN_HISTORY_RETENTION_DAYS)
    : Math.max(1, Number(fallbackDays) || 2);

  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function formatCampaignEndDate(value, locale = "pt-PT", timeZone = DEFAULT_TIME_ZONE) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export { DEFAULT_TIME_ZONE as CAMPAIGN_DEFAULT_TIME_ZONE };
