import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { dashEnv } from "./env";

export interface TelegramLoginPayload {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

const MAX_LOGIN_AGE_SECONDS = 300; // Telegram's own recommendation for the widget callback

/**
 * Verifies a Telegram Login Widget payload per
 * https://core.telegram.org/widgets/login#checking-authorization
 * (distinct algorithm from Mini App initData: secret key is SHA256(bot
 * token) directly, not HMAC-SHA256 keyed by "WebAppData").
 */
export function verifyTelegramLogin(payload: Record<string, string>, botToken: string): TelegramLoginPayload | null {
  const { hash, ...rest } = payload;
  if (!hash || !botToken) return null;

  const dataCheckString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("\n");

  // Login widget secret is plain SHA256(token), not the "WebAppData"-keyed
  // HMAC used for Mini App initData (see server/lib/telegram-init-data.ts).
  const secret = createHash("sha256").update(botToken).digest();
  const computedHash = createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const a = Buffer.from(computedHash, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const authDate = Number(rest.auth_date);
  if (!Number.isFinite(authDate)) return null;
  if (Date.now() / 1000 - authDate > MAX_LOGIN_AGE_SECONDS) return null;

  const id = Number(rest.id);
  if (!Number.isFinite(id)) return null;

  return {
    id,
    first_name: rest.first_name ?? "",
    last_name: rest.last_name,
    username: rest.username,
    photo_url: rest.photo_url,
    auth_date: authDate,
    hash,
  };
}

export interface DashSession {
  chatId: number;
  username: string | null;
  issuedAt: number;
}

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function sessionSecret(): string {
  if (!dashEnv.sessionSecret) {
    throw new Error("DASH_SESSION_SECRET is required to sign dashboard sessions");
  }
  return dashEnv.sessionSecret;
}

/** Signs a compact session token: base64url(json).base64url(hmac). No external session store needed. */
export function signSession(session: DashSession): string {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  const sig = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined | null): DashSession | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expectedSig = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let session: DashSession;
  try {
    session = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!Number.isFinite(session.issuedAt)) return null;
  if (Date.now() / 1000 - session.issuedAt > SESSION_MAX_AGE_SECONDS) return null;
  if (!dashEnv.adminChatIds.includes(session.chatId)) return null;
  return session;
}
