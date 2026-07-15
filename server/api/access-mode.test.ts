import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createHmac } from "node:crypto";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
const OUTSIDER = 999333; // never inserted into the allowlist

const { env } = await import("../env");
const { openDb } = await import("../db");
const { setOpenAccess } = await import("../lib/settings");
const { createApiRoutes } = await import("./routes");

function buildInitData(chatId: number): string {
  const params = new URLSearchParams();
  params.set("auth_date", String(Math.floor(Date.now() / 1000)));
  params.set("user", JSON.stringify({ id: chatId, first_name: "Test" }));
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(env.telegramBotToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

// /offers is a cheap authenticated endpoint with no external calls.
function getOffers(app: ReturnType<typeof createApiRoutes>, chatId: number) {
  return app.request("/offers", {
    headers: { "X-Telegram-Init-Data": buildInitData(chatId) },
  });
}

const realFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("api.telegram.org")) {
      return Promise.resolve(Response.json({ ok: true, result: { total_count: 0, photos: [] } }));
    }
    return realFetch(input as never);
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("open access toggle", () => {
  test("outsider is 403 by default, admitted when open access is on, 403 again when off", async () => {
    const db = openDb(":memory:");
    const app = createApiRoutes(db);

    expect((await getOffers(app, OUTSIDER)).status).toBe(403);

    setOpenAccess(db, true);
    expect((await getOffers(app, OUTSIDER)).status).toBe(200);

    setOpenAccess(db, false);
    expect((await getOffers(app, OUTSIDER)).status).toBe(403);
  });

  test("open access never grants admin", async () => {
    const db = openDb(":memory:");
    setOpenAccess(db, true);
    const app = createApiRoutes(db);
    const res = await app.request("/admin/access-config", {
      headers: { "X-Telegram-Init-Data": buildInitData(OUTSIDER) },
    });
    expect(res.status).toBe(403);
  });
});
