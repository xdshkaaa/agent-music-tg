import { createHmac } from "node:crypto";

const TOKEN_TTL_SECONDS = 24 * 60 * 60;

function signature(payload: string, botToken: string): string {
  return createHmac("sha256", botToken).update(`inline-webapp\n${payload}`).digest("base64url");
}

/** Signed fallback identity for Web Apps opened from an inline-results button. */
export function createInlineAuthToken(userId: number, botToken: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const payload = `${userId}.${nowSeconds}`;
  return `${payload}.${signature(payload, botToken)}`;
}

export function verifyInlineAuthToken(
  token: string,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): { userId: number; authDate: number } | null {
  const [userIdRaw, authDateRaw, suppliedSignature, ...extra] = token.split(".");
  if (!userIdRaw || !authDateRaw || !suppliedSignature || extra.length > 0) return null;
  const userId = Number(userIdRaw);
  const authDate = Number(authDateRaw);
  if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isInteger(authDate)) return null;
  if (authDate > nowSeconds + 60 || nowSeconds - authDate > TOKEN_TTL_SECONDS) return null;
  const expected = signature(`${userIdRaw}.${authDateRaw}`, botToken);
  if (!timingSafeEqual(expected, suppliedSignature)) return null;
  return { userId, authDate };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
