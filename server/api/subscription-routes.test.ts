import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
const CHAT_ID = 777001;
const CHANNEL_ID = -100123;

const { env } = await import("../env");
const { openDb } = await import("../db");
const { upsertUser } = await import("../access/users-store");
const { addRequiredChannel, setSubscriptionGateEnabled } = await import("../access/channel-gate-store");
const { createApiRoutes } = await import("./routes");

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

function freshDb(): AppDb {
  const db = openDb(":memory:");
  db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [CHAT_ID]);
  upsertUser(db, CHAT_ID);
  addRequiredChannel(db, CHANNEL_ID, "Test Channel", "testchannel", null);
  setSubscriptionGateEnabled(db, true);
  return db;
}

function req(app: ReturnType<typeof createApiRoutes>, path: string, init: RequestInit = {}) {
  return app.request(path, {
    ...init,
    headers: { ...init.headers, "X-Telegram-Init-Data": buildInitData(CHAT_ID) },
  });
}

describe("subscription recheck route", () => {
  test("reflects a membership change immediately (force:true is actually wired)", async () => {
    const db = freshDb();
    let isMember = false;
    const app = createApiRoutes(db, { getChatMember: async () => ({ status: isMember ? "member" : "left" }) });

    // Gated route rejects while not a member.
    expect((await req(app, "/me")).status).toBe(403);

    const first = await req(app, "/subscription/recheck", { method: "POST" });
    expect((await first.json()) as { ok: boolean }).toMatchObject({ ok: false });

    // User joins the channel between checks.
    isMember = true;

    const second = await req(app, "/subscription/recheck", { method: "POST" });
    const body = (await second.json()) as { ok: boolean; channels: Array<{ isMember: boolean }> };
    expect(body.ok).toBe(true);
    expect(body.channels[0]!.isMember).toBe(true);

    // Gated route now passes because the recheck wrote a fresh cache entry.
    expect((await req(app, "/me")).status).toBe(200);
  });

  test("recheck route itself is reachable while gated (mount-order exemption)", async () => {
    const db = freshDb();
    const app = createApiRoutes(db, { getChatMember: async () => ({ status: "left" }) });

    // Confirm the gate is actually active for a normal route first.
    expect((await req(app, "/me")).status).toBe(403);

    // The recheck route must not itself be blocked by the gate it exists to clear.
    const res = await req(app, "/subscription/recheck", { method: "POST" });
    expect(res.status).toBe(200);
  });
});
