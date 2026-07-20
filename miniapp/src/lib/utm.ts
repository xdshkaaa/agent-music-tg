export const TELEGRAM_START_PARAM_LIMIT = 64;

export interface UtmFields {
  source: string;
  medium: string;
  campaign: string;
  content?: string;
  term?: string;
}

export function normalizeUtmSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

/** Encodes UTM fields into Telegram's URL-safe start payload. */
export function buildTelegramUtmPayload(fields: UtmFields): string | null {
  const source = normalizeUtmSlug(fields.source);
  const medium = normalizeUtmSlug(fields.medium) || "telegram";
  const campaign = normalizeUtmSlug(fields.campaign);
  const content = normalizeUtmSlug(fields.content ?? "");
  const term = normalizeUtmSlug(fields.term ?? "");
  if (!source || !campaign) return null;
  const parts = [source, medium, campaign];
  if (content || term) parts.push(content);
  if (term) parts.push(term);
  const payload = `utm_${parts.join("__")}`;
  return payload.length <= TELEGRAM_START_PARAM_LIMIT ? payload : null;
}

export function buildTelegramUtmLink(botBaseUrl: string, fields: UtmFields): string | null {
  const payload = buildTelegramUtmPayload(fields);
  if (!payload) return null;
  try {
    const url = new URL(botBaseUrl);
    url.search = "";
    url.hash = "";
    url.searchParams.set("start", payload);
    return url.toString();
  } catch {
    return null;
  }
}
