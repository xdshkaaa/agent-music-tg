import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
const OWNER = 777001;
const OUTSIDER = 777002; // never inserted into the allowlist

const { env } = await import("../env");
const { openDb } = await import("../db");
const { upsertUser } = await import("../access/users-store");
const { insertGeneration } = await import("../access/generations-store");
const { createApiRoutes } = await import("./routes");

function buildInitData(chatId: number, startParam?: string): string {
  const params = new URLSearchParams();
  params.set("auth_date", String(Math.floor(Date.now() / 1000)));
  params.set("user", JSON.stringify({ id: chatId, first_name: "Test" }));
  if (startParam) params.set("start_param", startParam);
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
  db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [OWNER]);
  upsertUser(db, OWNER);
  return db;
}

function req(app: ReturnType<typeof createApiRoutes>, path: string, chatId: number, init: RequestInit = {}) {
  return app.request(path, {
    ...init,
    headers: { ...init.headers, "X-Telegram-Init-Data": buildInitData(chatId), "content-type": "application/json" },
  });
}

async function publishOwnGeneration(
  app: ReturnType<typeof createApiRoutes>,
  db: ReturnType<typeof freshDb>,
) {
  const id = insertGeneration(db, OWNER, "дождь", "Вечерний драйв", 2, [
    { uri: "ytm:a", title: "One", artist: "A", artwork: "http://x/1.jpg" },
    { uri: "ytm:b", title: "Two", artist: "B" },
  ]);
  const res = await req(app, "/shares", OWNER, {
    method: "POST",
    body: JSON.stringify({ kind: "generation", id }),
  });
  return { id, res, body: (await res.json()) as { token: string; url: string } };
}

describe("share routes", () => {
  test("publishes a generation and returns a stable token and url", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const first = await publishOwnGeneration(app, db);
    expect(first.res.status).toBe(200);
    expect(first.body.token).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(first.body.url).toContain(`start=pl_${first.body.token}`);

    const again = await req(app, "/shares", OWNER, {
      method: "POST",
      body: JSON.stringify({ kind: "generation", id: first.id }),
    });
    expect(((await again.json()) as { token: string }).token).toBe(first.body.token);
  });

  test("refuses to publish a generation the caller does not own", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const foreign = insertGeneration(db, 999999, "чужое", "Чужой", 1, [
      { uri: "ytm:z", title: "Z", artist: "Z" },
    ]);
    const res = await req(app, "/shares", OWNER, {
      method: "POST",
      body: JSON.stringify({ kind: "generation", id: foreign }),
    });
    expect(res.status).toBe(404);
  });

  test("a non-allowlisted chat can read a share but cannot publish one", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const { body } = await publishOwnGeneration(app, db);

    const read = await req(app, `/shares/${body.token}`, OUTSIDER);
    expect(read.status).toBe(200);
    const share = (await read.json()) as { name: string; tracks: unknown[]; isOwner: boolean };
    expect(share.name).toBe("Вечерний драйв");
    expect(share.tracks).toHaveLength(2);
    expect(share.isOwner).toBe(false);

    const publish = await req(app, "/shares", OUTSIDER, {
      method: "POST",
      body: JSON.stringify({ kind: "generation", id: 1 }),
    });
    expect(publish.status).toBe(403);
  });

  test("counts a view once per viewer and never for the owner", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const { body } = await publishOwnGeneration(app, db);
    await req(app, `/shares/${body.token}`, OUTSIDER);
    await req(app, `/shares/${body.token}`, OUTSIDER);
    await req(app, `/shares/${body.token}`, OWNER);
    const owner = (await (await req(app, `/shares/${body.token}`, OWNER)).json()) as {
      viewCount: number;
      isOwner: boolean;
    };
    expect(owner.viewCount).toBe(1);
    expect(owner.isOwner).toBe(true);
  });

  test("unknown token is 404, revoked token is 410", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const { body } = await publishOwnGeneration(app, db);
    expect((await req(app, "/shares/aaaaaaaaaa", OWNER)).status).toBe(404);

    const del = await req(app, `/shares/${body.token}`, OWNER, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect((await req(app, `/shares/${body.token}`, OWNER)).status).toBe(410);
  });

  test("revoking someone else's share is refused", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const { body } = await publishOwnGeneration(app, db);
    expect((await req(app, `/shares/${body.token}`, OUTSIDER, { method: "DELETE" })).status).toBe(403);
  });

  test("a newcomer arriving with a share start param credits the author once", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const { body } = await publishOwnGeneration(app, db);

    const initData = buildInitData(OUTSIDER, `pl_${body.token}`);
    const call = () => app.request(`/shares/${body.token}`, { headers: { "X-Telegram-Init-Data": initData } });
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);

    const events = db
      .query("SELECT referrer_chat_id AS r FROM referral_events WHERE referred_chat_id = ?")
      .all(OUTSIDER) as { r: number }[];
    expect(events).toHaveLength(1);
    expect(events[0]!.r).toBe(OWNER);
  });
});
