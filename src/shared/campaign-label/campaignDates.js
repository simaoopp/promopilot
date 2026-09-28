function pad(value) {
  return String(value).padStart(2, "0");
}

function isValidDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 2000 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return false;

  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

function toIsoDate(year, month, day) {
  if (!isValidDateParts(year, month, day)) return "";
  return `${Number(year)}-${pad(month)}-${pad(day)}`;
}

export function normalizeCampaignDate(value, fallbackYear = new Date().getFullYear()) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\D.*)?$/);
  if (match) return toIsoDate(match[1], match[2], match[3]);

  match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\D.*)?$/);
  if (match) return toIsoDate(match[3], match[2], match[1]);

  match = raw.match(/^(\d{1,2})[-/.](\d{1,2})(?:\D.*)?$/);
  if (match) return toIsoDate(fallbackYear, match[2], match[1]);

  return "";
}

export function deriveCampaignEndDate(items = [], fallbackYear = new Date().getFullYear()) {
  const dates = (Array.isArray(items) ? items : [])
    .map((item) =>
      normalizeCampaignDate(
        item?.dataFim ?? item?.data_fim ?? item?.endDate ?? item?.validadeFim ?? "",
        fallbackYear,
      ),
    )
    .filter(Boolean)
    .sort();

  return dates.length ? dates[dates.length - 1] : "";
}

export function buildCampaignHistoryExpiry({
  items = [],
  fallbackYear = new Date().getFullYear(),
  minimumDays = 2,
  daysAfterEnd = 2,
  now = new Date(),
} = {}) {
  const minimumExpiry = new Date(now.getTime() + Math.max(1, Number(minimumDays) || 2) * 86400000);
  const endDate = deriveCampaignEndDate(items, fallbackYear);

  if (!endDate) return minimumExpiry.toISOString();

  const endExpiry = new Date(`${endDate}T23:59:59.999Z`);
  endExpiry.setUTCDate(endExpiry.getUTCDate() + Math.max(1, Number(daysAfterEnd) || 2));

  return new Date(Math.max(minimumExpiry.getTime(), endExpiry.getTime())).toISOString();
}

export function compareIsoDateOnly(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
