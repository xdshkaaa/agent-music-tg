import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

// Set env BEFORE importing env.ts (it reads process.env at load and caches).
// In the full test suite, env may already be cached by another file with no
// ALLOWLIST set, so we ALSO insert the allowlist row directly in freshDb()
// below — bypassing bootstrapAllowlist (which reads the cached env singleton).
process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
const TEST_CHAT = 555555;

const { env } = await import("../env");
const { openDb } = await import("../db");
const { getUser, upsertUser, SIGNUP_BONUS_CREDITS } = await import("../access/users-store");
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
  // /me calls out to api.telegram.org (getUserProfilePhotos / getFile) — stub
  // fetch so tests never touch the network. Default: Telegram says "no photos".
  const realFetch = globalThis.fetch;
  let telegramResponses: Record<string, unknown>;

  beforeEach(() => {
    telegramResponses = {
      getUserProfilePhotos: { ok: true, result: { total_count: 0, photos: [] } },
      getFile: { ok: false },
    };
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = Object.keys(telegramResponses).find((m) => url.includes(`/${m}`));
      if (url.includes("api.telegram.org") && method) {
        return Promise.resolve(Response.json(telegramResponses[method]));
      }
      return realFetch(input as never);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

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
    expect(getUser(db, TEST_CHAT)?.firstName).toBe("Test");
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

  test("fetches and persists photo file_id on demand when none stored", async () => {
    const db = freshDb();
    telegramResponses.getUserProfilePhotos = {
      ok: true,
      result: { total_count: 1, photos: [[{ file_id: "small-id" }, { file_id: "big-id" }]] },
    };
    telegramResponses.getFile = {
      ok: true,
      result: { file_path: "photos/file_1.jpg", file_unique_id: "uniq1" },
    };

    const app = createApiRoutes(db);
    const res = await app.request("/me", {
      headers: { "X-Telegram-Init-Data": buildInitData(TEST_CHAT) },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.photoUrl).toContain("photos/file_1.jpg");

    const row = db.query("SELECT photo_file_id FROM users WHERE chat_id = ?").get(TEST_CHAT) as { photo_file_id: string };
    expect(row.photo_file_id).toBe("big-id");
  });

  test("photoUrl is null when Telegram has no profile photos", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const res = await app.request("/me", {
      headers: { "X-Telegram-Init-Data": buildInitData(TEST_CHAT) },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.photoUrl).toBeNull();
  });

  test("refreshes stale stored file_id via getUserProfilePhotos", async () => {
    const db = freshDb();
    upsertUser(db, TEST_CHAT);
    const { setPhotoFileId } = await import("../access/users-store");
    setPhotoFileId(db, TEST_CHAT, "stale-id");
    telegramResponses.getUserProfilePhotos = {
      ok: true,
      result: { total_count: 1, photos: [[{ file_id: "fresh-id" }]] },
    };
    let getFileCalls = 0;
    const responsesByCall = [
      { ok: false }, // stale-id lookup fails
      { ok: true, result: { file_path: "photos/fresh.jpg", file_unique_id: "uniq2" } },
    ];
    const baseFetch = globalThis.fetch;
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/getFile")) {
        return Promise.resolve(Response.json(responsesByCall[Math.min(getFileCalls++, 1)]));
      }
      return baseFetch(input as never);
    }) as typeof fetch;

    const app = createApiRoutes(db);
    const res = await app.request("/me", {
      headers: { "X-Telegram-Init-Data": buildInitData(TEST_CHAT) },
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.photoUrl).toContain("photos/fresh.jpg");
    const row = db.query("SELECT photo_file_id FROM users WHERE chat_id = ?").get(TEST_CHAT) as { photo_file_id: string };
    expect(row.photo_file_id).toBe("fresh-id");
  });

  test("rejects unauthenticated callers", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const res = await app.request("/me", { headers: { "X-Telegram-Init-Data": "" } });
    expect(res.status).toBe(401);
  });
});
