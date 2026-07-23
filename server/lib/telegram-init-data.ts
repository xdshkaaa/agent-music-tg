import { createHmac } from "node:crypto";

export interface TelegramInitDataUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
}

export interface VerifiedInitData {
  chatId: number;
  user: TelegramInitDataUser;
  authDate: number;
  startParam: string | null;
}

const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60;

// botToken is static for the process lifetime — every authenticated request
// (including the many Range requests one song's playback makes against
// /api/stream) was re-deriving this HMAC key from scratch. Cache per token.
let cachedSecretKey: { token: string; key: Buffer } | null = null;

function secretKeyFor(botToken: string): Buffer {
  if (cachedSecretKey && cachedSecretKey.token === botToken) return cachedSecretKey.key;
  const key = createHmac("sha256", "WebAppData").update(botToken).digest();
  cachedSecretKey = { token: botToken, key };
  return key;
}

/**
 * Verifies Telegram Mini App initData per the Mini Apps spec:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * Returns the trusted chat/user identity, or null if the signature is invalid,
 * missing, or stale. Callers MUST treat a null result as unauthenticated.
 */
export function verifyInitData(initData: string, botToken: string): VerifiedInitData | null {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = secretKeyFor(botToken);
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!timingSafeEqualHex(computedHash, hash)) return null;

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) return null;
  if (Date.now() / 1000 - authDate > MAX_INIT_DATA_AGE_SECONDS) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;
  let user: TelegramInitDataUser;
  try {
    user = JSON.parse(userRaw);
  } catch {
    return null;
  }
  if (typeof user.id !== "number") return null;

  // In a private chat with the bot (the only surface this app runs in),
  // the user's own ID is the chat ID.
  return { chatId: user.id, user, authDate, startParam: params.get("start_param") };
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
