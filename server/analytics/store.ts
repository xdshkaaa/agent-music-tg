import type { AppDb } from "../db";

export const ANALYTICS_EVENTS = [
  "bot_started",
  "miniapp_opened",
  "generation_started",
  "generation_completed",
  "paywall_viewed",
  "shop_viewed",
  "trial_claimed",
  "checkout_started",
  "purchase_completed",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export interface AttributionInput {
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  startParam: string | null;
}

const MAX_TAG_LENGTH = 100;
const MAX_START_PARAM_LENGTH = 256;

function cleanTag(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
  return clean || null;
}

/**
 * Telegram deep-link attribution format:
 *   utm_<source>__<medium>__<campaign>__[content]__[term]
 * Example: utm_vk__cpc__summer-2026__banner-a
 *
 * Double underscores delimit fields while single hyphens remain available in
 * slugs. The full payload remains within Telegram's A-Z/a-z/0-9/_/- alphabet.
 */
export function parseStartAttribution(raw: string | null | undefined): AttributionInput {
  const startParam = raw?.trim().slice(0, MAX_START_PARAM_LENGTH) || null;
  if (!startParam) {
    return { source: "direct", medium: "telegram", campaign: null, content: null, term: null, startParam: null };
  }

  const referral = /^ref_(\d+)$/.exec(startParam);
  if (referral) {
    return {
      source: "referral",
      medium: "telegram",
      campaign: "member-get-member",
      content: `referrer-${referral[1]}`,
      term: null,
      startParam,
    };
  }

  if (startParam.startsWith("utm_")) {
    const [source, medium, campaign, content, term] = startParam.slice(4).split("__", 5).map(cleanTag);
    return {
      source: source ?? "unknown",
      medium: medium ?? "telegram",
      campaign: campaign ?? null,
      content: content ?? null,
      term: term ?? null,
      startParam,
    };
  }

  const sourceOnly = /^src_([a-zA-Z0-9_-]+)$/.exec(startParam);
  if (sourceOnly) {
    return {
      source: cleanTag(sourceOnly[1]) ?? "unknown",
      medium: "telegram",
      campaign: null,
      content: null,
      term: null,
      startParam,
    };
  }

  return {
    source: "telegram",
    medium: "deep-link",
    campaign: cleanTag(startParam),
    content: null,
    term: null,
    startParam,
  };
}

/** Records immutable first-touch attribution. Returns true only on insert. */
export function recordFirstTouch(db: AppDb, chatId: number, input: AttributionInput): boolean {
  const existing = db.query<{ source: string; medium: string | null }, [number]>(
    `SELECT source, medium FROM user_attribution WHERE chat_id = ?`,
  ).get(chatId);
  // Migration-created legacy rows are placeholders, not observed touches. A
  // real tagged launch may safely replace them while established attribution
  // remains immutable.
  if (existing?.source === "unknown" && existing.medium === "legacy" && input.startParam) {
    const result = db.query(
      `UPDATE user_attribution
       SET source = ?, medium = ?, campaign = ?, content = ?, term = ?, start_param = ?, created_at = unixepoch()
       WHERE chat_id = ? AND source = 'unknown' AND medium = 'legacy'`,
    ).run(
      cleanTag(input.source) ?? "unknown",
      cleanTag(input.medium),
      cleanTag(input.campaign),
      cleanTag(input.content),
      cleanTag(input.term),
      input.startParam.slice(0, MAX_START_PARAM_LENGTH),
      chatId,
    );
    return result.changes === 1;
  }
  const result = db.query(
    `INSERT OR IGNORE INTO user_attribution
       (chat_id, source, medium, campaign, content, term, start_param)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    chatId,
    cleanTag(input.source) ?? "unknown",
    cleanTag(input.medium),
    cleanTag(input.campaign),
    cleanTag(input.content),
    cleanTag(input.term),
    input.startParam?.slice(0, MAX_START_PARAM_LENGTH) ?? null,
  );
  return result.changes === 1;
}

/** Records a tagged campaign visit even when the visitor is not a new user. */
export function recordAttributionTouch(db: AppDb, chatId: number, input: AttributionInput): boolean {
  if (!input.startParam) return false;
  const result = db.query(
    `INSERT INTO attribution_touches
       (chat_id, source, medium, campaign, content, term, start_param)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_id, start_param) DO UPDATE SET
       last_seen = unixepoch(),
       touch_count = attribution_touches.touch_count + 1`,
  ).run(
    chatId,
    cleanTag(input.source) ?? "unknown",
    cleanTag(input.medium),
    cleanTag(input.campaign),
    cleanTag(input.content),
    cleanTag(input.term),
    input.startParam.slice(0, MAX_START_PARAM_LENGTH),
  );
  return result.changes === 1;
}

export function recordEvent(
  db: AppDb,
  chatId: number,
  eventName: AnalyticsEventName,
  properties: Record<string, unknown> = {},
  eventKey?: string,
): boolean {
  const result = db.query(
    `INSERT OR IGNORE INTO analytics_events (chat_id, event_name, properties_json, event_key)
     VALUES (?, ?, ?, ?)`,
  ).run(chatId, eventName, JSON.stringify(properties), eventKey ?? null);
  return result.changes === 1;
}

/** At most one copy of a high-frequency view event per user and UTC day. */
export function recordDailyEvent(
  db: AppDb,
  chatId: number,
  eventName: AnalyticsEventName,
  properties: Record<string, unknown> = {},
): boolean {
  const day = new Date().toISOString().slice(0, 10);
  return recordEvent(db, chatId, eventName, properties, `${eventName}:${chatId}:${day}`);
}
