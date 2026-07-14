import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
const TEST_CHAT = 999991;

const { env } = await import("../env");
const { openDb } = await import("../db");
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

function freshDb() {
  const db = openDb(":memory:");
  db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [TEST_CHAT]);
  return db;
}

function post(app: ReturnType<typeof createApiRoutes>, path: string, body?: unknown) {
  return app.request(path, {
    method: "POST",
    headers: {
      "X-Telegram-Init-Data": buildInitData(TEST_CHAT),
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("POST /api/trial/claim", () => {
  const savedPaymentsEnabled = env.paymentsEnabled;

  test("happy path: first claim returns trial status", async () => {
    env.paymentsEnabled = true;
    try {
      const db = freshDb();
      const app = createApiRoutes(db);
      const res = await post(app, "/trial/claim");
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty("trial");
      const trial = body.trial as Record<string, unknown>;
      expect(trial.claimed).toBe(true);
      expect(trial.active).toBe(true);
      expect(trial.creditsLeft).toBe(10);
      expect(typeof trial.until).toBe("number");
      expect(trial.until).toBeGreaterThan(Math.floor(Date.now() / 1000));
    } finally {
      env.paymentsEnabled = savedPaymentsEnabled;
    }
  });

  test("repeat claim returns 409", async () => {
    env.paymentsEnabled = true;
    try {
      const db = freshDb();
      const app = createApiRoutes(db);
      await post(app, "/trial/claim");
      const res2 = await post(app, "/trial/claim");
      expect(res2.status).toBe(409);
      const body = (await res2.json()) as Record<string, unknown>;
      expect(body.error).toBe("trial already claimed");
    } finally {
      env.paymentsEnabled = savedPaymentsEnabled;
    }
  });

  test("payments disabled returns 503", async () => {
    env.paymentsEnabled = false;
    try {
      const db = freshDb();
      const app = createApiRoutes(db);
      const res = await post(app, "/trial/claim");
      expect(res.status).toBe(503);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error).toBe("payments disabled");
    } finally {
      env.paymentsEnabled = savedPaymentsEnabled;
    }
  });
});

describe("GET /api/me trial status", () => {
  const savedPaymentsEnabled = env.paymentsEnabled;

  test("reports unclaimed trial for fresh user", async () => {
    env.paymentsEnabled = true;
    try {
      const db = freshDb();
      const app = createApiRoutes(db);
      const res = await app.request("/me", {
        headers: { "X-Telegram-Init-Data": buildInitData(TEST_CHAT) },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty("trial");
      const trial = body.trial as Record<string, unknown>;
      expect(trial.claimed).toBe(false);
      expect(trial.active).toBe(false);
      expect(trial.creditsLeft).toBe(0);
      expect(trial.until).toBeNull();
    } finally {
      env.paymentsEnabled = savedPaymentsEnabled;
    }
  });

  test("reports active trial after claim", async () => {
    env.paymentsEnabled = true;
    try {
      const db = freshDb();
      const app = createApiRoutes(db);
      await post(app, "/trial/claim");
      const res = await app.request("/me", {
        headers: { "X-Telegram-Init-Data": buildInitData(TEST_CHAT) },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      const trial = body.trial as Record<string, unknown>;
      expect(trial.claimed).toBe(true);
      expect(trial.active).toBe(true);
      expect(trial.creditsLeft).toBe(10);
      expect(typeof trial.until).toBe("number");
    } finally {
      env.paymentsEnabled = savedPaymentsEnabled;
    }
  });
});
