import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

// Set env BEFORE importing env.ts (it reads process.env at load and caches).
// In the full test suite, env may already be cached by another file with no
// ALLOWLIST set, so we ALSO insert the allowlist row directly in freshDb()
// below — bypassing bootstrapAllowlist (which reads the cached env singleton).
process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
const TEST_CHAT = 555555;

const { env } = await import("../env");
const { openDb } = await import("../db");
const { upsertUser, SIGNUP_BONUS_CREDITS } = await import("../access/users-store");
const { createApiRoutes } = await import("./routes");

/** Builds a valid Telegram Mini App initData string signed with the bot token. */
function buildInitData(chatId: number, username?: string): string {
  const params = new URLSearchParams();
  params.set("auth_date", String(Math.floor(Date.now() / 1000)));
  params.set(
    "user",
    JSON.stringify({ id: chatId, first_name: "Test", ...(username ? { username } : {}) }),
  );
  // Compute hash per https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(env.telegramBotToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

function freshDb() {
  const db = openDb(":memory:");
  // Seed the allowlist directly so the test is isolated from the env singleton's
  // (possibly empty / cached) ALLOWLIST_CHAT_IDS.
  db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [TEST_CHAT]);
  return db;
}

describe("GET /api/me", () => {
  test("returns chatId, isAdmin, credits, subscriptionUntil, and username when set", async () => {
    const db = freshDb();
    upsertUser(db, TEST_CHAT, "testuser");

    const app = createApiRoutes(db);
    const res = await app.request("/me", {
      headers: { "X-Telegram-Init-Data": buildInitData(TEST_CHAT, "testuser") },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.chatId).toBe(TEST_CHAT);
    expect(body.isAdmin).toBe(false);
    expect(body.credits).toBe(SIGNUP_BONUS_CREDITS);
    expect(body.subscriptionUntil).toBeNull();
    expect(body.username).toBe("testuser");
  });

  test("omits username when the user has none recorded", async () => {
    const db = freshDb();

    const app = createApiRoutes(db);
    const res = await app.request("/me", {
      headers: { "X-Telegram-Init-Data": buildInitData(TEST_CHAT) },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.chatId).toBe(TEST_CHAT);
    expect(body.username).toBeUndefined();
    // Previous fields still present.
    expect(body.isAdmin).toBe(false);
    expect(body.credits).toBe(SIGNUP_BONUS_CREDITS);
    expect(body.subscriptionUntil).toBeNull();
  });

  test("rejects unauthenticated callers", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const res = await app.request("/me", { headers: { "X-Telegram-Init-Data": "" } });
    expect(res.status).toBe(401);
  });
});
