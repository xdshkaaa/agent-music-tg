import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createHmac } from "node:crypto";
import type { AppEnv } from "./context";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
const CHAT_ID = 777001;
const CHANNEL_ID = -100123;

const { env } = await import("../env");
const { openDb } = await import("../db");
const { upsertUser } = await import("../access/users-store");
const { addRequiredChannel, setSubscriptionGateEnabled } = await import("../access/channel-gate-store");
const { requireAuth, requireSubscription } = await import("./middleware");
const { createInlineAuthToken } = await import("../lib/inline-auth");

type AppDb = ReturnType<typeof openDb>;

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

function freshDb(isAdmin = false): AppDb {
  const db = openDb(":memory:");
  db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, ?)", [CHAT_ID, isAdmin ? 1 : 0]);
  upsertUser(db, CHAT_ID);
  return db;
}

function buildApp(db: AppDb, deps: { getChatMember?: (channelId: number, chatId: number) => Promise<{ status: string }> }) {
  const app = new Hono<AppEnv>();
  app.use("*", requireAuth(db));
  app.use("*", requireSubscription(db, deps));
  app.get("/ping", (c) => c.json({ ok: true }));
  return app;
}

function ping(app: ReturnType<typeof buildApp>) {
  return app.request("/ping", { headers: { "X-Telegram-Init-Data": buildInitData(CHAT_ID) } });
}

describe("requireSubscription", () => {
  test("gate disabled: request passes through", async () => {
    const db = freshDb();
    addRequiredChannel(db, CHANNEL_ID, "Test Channel", "testchannel", null);
    // setSubscriptionGateEnabled left false (default)
    const app = buildApp(db, { getChatMember: async () => ({ status: "left" }) });
    expect((await ping(app)).status).toBe(200);
  });

  test("gate enabled but no required channels: request passes through", async () => {
    const db = freshDb();
    setSubscriptionGateEnabled(db, true);
    const app = buildApp(db, { getChatMember: async () => ({ status: "left" }) });
    expect((await ping(app)).status).toBe(200);
  });

  test("admin chat passes through regardless of membership", async () => {
    const db = freshDb(true);
    addRequiredChannel(db, CHANNEL_ID, "Test Channel", "testchannel", null);
    setSubscriptionGateEnabled(db, true);
    const app = buildApp(db, { getChatMember: async () => ({ status: "left" }) });
    expect((await ping(app)).status).toBe(200);
  });

  test("non-member with gate enabled gets 403 subscription_required with channel list", async () => {
    const db = freshDb();
    addRequiredChannel(db, CHANNEL_ID, "Test Channel", "testchannel", null);
    setSubscriptionGateEnabled(db, true);
    const app = buildApp(db, { getChatMember: async () => ({ status: "left" }) });
    const res = await ping(app);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; channels: Array<{ title: string }> };
    expect(body.error).toBe("subscription_required");
    expect(body.channels).toHaveLength(1);
    expect(body.channels[0]!.title).toBe("Test Channel");
  });

  test("member with gate enabled passes through", async () => {
    const db = freshDb();
    addRequiredChannel(db, CHANNEL_ID, "Test Channel", "testchannel", null);
    setSubscriptionGateEnabled(db, true);
    const app = buildApp(db, { getChatMember: async () => ({ status: "member" }) });
    expect((await ping(app)).status).toBe(200);
  });

  test("getChatMember dep absent: request passes through (fail-open)", async () => {
    const db = freshDb();
    addRequiredChannel(db, CHANNEL_ID, "Test Channel", "testchannel", null);
    setSubscriptionGateEnabled(db, true);
    const app = buildApp(db, {});
    expect((await ping(app)).status).toBe(200);
  });
});

describe("inline Web App authentication", () => {
  test("accepts a valid signed inline launch token when Telegram initData is absent", async () => {
    const app = buildApp(freshDb(), {});
    const token = createInlineAuthToken(CHAT_ID, env.telegramBotToken);
    const res = await app.request("/ping", { headers: { "X-Inline-Auth": token } });
    expect(res.status).toBe(200);
  });

  test("rejects a tampered inline launch token", async () => {
    const app = buildApp(freshDb(), {});
    const token = createInlineAuthToken(CHAT_ID, env.telegramBotToken);
    const res = await app.request("/ping", { headers: { "X-Inline-Auth": `${token}x` } });
    expect(res.status).toBe(401);
  });
});
