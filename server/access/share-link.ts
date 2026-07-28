import { env } from "../env";

export const SHARE_START_PREFIX = "pl_";

/** Mirrors the token shape minted by shares-store's generateShareToken. */
const SHARE_START_PATTERN = /^pl_([A-Za-z0-9]{10})$/;

/**
 * The `startapp` form needs a Mini App short name registered in BotFather; the
 * bot opens the app through web_app buttons carrying a URL, so no short name is
 * guaranteed to exist. The `start` form always works and lands the recipient in
 * the bot, which is also where a newcomer gets attributed and the author
 * credited — so it is the default, not a degraded fallback.
 */
export function buildShareUrl(botUsername: string, token: string): string {
  if (env.miniappName) {
    return `https://t.me/${botUsername}/${env.miniappName}?startapp=${SHARE_START_PREFIX}${token}`;
  }
  return `https://t.me/${botUsername}?start=${SHARE_START_PREFIX}${token}`;
}

export function parseShareToken(startParam: string | null | undefined): string | null {
  const match = SHARE_START_PATTERN.exec((startParam ?? "").trim());
  return match ? match[1]! : null;
}
