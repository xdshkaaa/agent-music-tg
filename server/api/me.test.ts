import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";

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
const { AVATAR_DIR } = await import("../avatar");

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
  // /me calls out to api.telegram.org (getUserProfilePhotos / getFile, then the
  // /file/bot<token>/... download) — stub fetch so tests never touch the
  // network. Default: Telegram says "no photos".
  const realFetch = globalThis.fetch;
  let telegramResponses: Record<string, unknown>;
  /** file_unique_ids whose cached avatar this test wrote, cleaned up after. */
  const cachedAvatars = new Set<string>();

  function stubTelegram(handler?: (url: string) => Response | undefined) {
    globalThis.fetch = ((input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      const custom = handler?.(url);
      if (custom) return Promise.resolve(custom);
      const method = Object.keys(telegramResponses).find((m) => url.includes(`/${m}`));
      if (url.includes("api.telegram.org") && method) {
        return Promise.resolve(Response.json(telegramResponses[method]));
      }
      // Avatar image download (/file/bot<token>/<path>) — serve bytes, never the network.
      if (url.includes("api.telegram.org/file/")) {
        return Promise.resolve(new Response(new Uint8Array([0xff, 0xd8, 0xff])));
      }
      throw new Error(`unexpected network call in test: ${url}`);
    }) as typeof fetch;
  }

  /** Lets the background avatar resolution (Telegram fetches + cache write) finish. */
  async function settleBackgroundAvatar() {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 1));
  }

  beforeEach(() => {
    telegramResponses = {
      getUserProfilePhotos: { ok: true, result: { total_count: 0, photos: [] } },
      getFile: { ok: false },
    };
    stubTelegram();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    for (const id of cachedAvatars) rmSync(join(AVATAR_DIR, `${id}.jpg`), { force: true });
    cachedAvatars.clear();
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

    cachedAvatars.add("uniq1");

    const app = createApiRoutes(db);
    // Avatar resolution runs in the background so Telegram never blocks /me:
    // the first call returns null and kicks off the lookup, the next one has it.
    const first = await app.request("/me", {
      headers: { "X-Telegram-Init-Data": buildInitData(TEST_CHAT) },
    });
    expect(first.status).toBe(200);
    expect((await first.json() as Record<string, unknown>).photoUrl).toBeNull();

    await settleBackgroundAvatar();
    const res = await app.request("/me", {
      headers: { "X-Telegram-Init-Data": buildInitData(TEST_CHAT) },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // Avatars are proxied through /avatar/<file_unique_id>.jpg — the raw
    // Telegram file URL must never be handed to the client, it embeds the token.
    expect(body.photoUrl).toBe("/avatar/uniq1.jpg");
    expect(body.photoUrl).not.toContain(env.telegramBotToken);

    // Highest-resolution photo (last entry) is the one persisted.
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
    cachedAvatars.add("uniq2");
    let getFileCalls = 0;
    const responsesByCall = [
      { ok: false }, // stale-id lookup fails
      { ok: true, result: { file_path: "photos/fresh.jpg", file_unique_id: "uniq2" } },
    ];
    stubTelegram((url) =>
      url.includes("/getFile")
        ? Response.json(responsesByCall[Math.min(getFileCalls++, 1)])
        : undefined,
    );

    const app = createApiRoutes(db);
    await app.request("/me", {
      headers: { "X-Telegram-Init-Data": buildInitData(TEST_CHAT) },
    });
    await settleBackgroundAvatar();
    const res = await app.request("/me", {
      headers: { "X-Telegram-Init-Data": buildInitData(TEST_CHAT) },
    });
    const body = (await res.json()) as Record<string, unknown>;
    // Refreshed photo is re-cached under the NEW file_unique_id.
    expect(body.photoUrl).toBe("/avatar/uniq2.jpg");
    expect(getFileCalls).toBe(2); // stale lookup, then retry after refresh
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
