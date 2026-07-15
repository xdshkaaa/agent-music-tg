import { describe, expect, test, mock } from "bun:test";
import { createHmac } from "node:crypto";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
const TEST_CHAT = 888882;
const RETRY_AT = Math.floor(Date.now() / 1000) + 1800;

// Force the generation entrypoints to report an exhausted subscription limit
// so the route-level surfacing (HTTP 429 / SSE frame) can be asserted.
mock.module("../core/run-generation", () => ({
  startGeneration: async () => ({ status: "rate_limited", retryAt: RETRY_AT }),
  resumeGeneration: async () => ({ status: "rate_limited", retryAt: RETRY_AT }),
  extendGeneration: async () => ({ status: "rate_limited", retryAt: RETRY_AT }),
}));

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

function post(app: ReturnType<typeof createApiRoutes>, path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "X-Telegram-Init-Data": buildInitData(TEST_CHAT), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("rate_limited surfacing in routes", () => {
  test("JSON /generate → HTTP 429 with retryAt", async () => {
    const app = createApiRoutes(freshDb());
    const res = await post(app, "/generate", { prompt: "эмбиент для сна" });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { status: string; retryAt: number };
    expect(body.status).toBe("rate_limited");
    expect(body.retryAt).toBe(RETRY_AT);
  });

  test("SSE /generate/stream → terminal rate_limited outcome frame", async () => {
    const app = createApiRoutes(freshDb());
    const res = await post(app, "/generate/stream", { prompt: "эмбиент для сна" });
    expect(res.status).toBe(200);
    const text = await res.text();
    const frames = text
      .split("\n\n")
      .map((f) => f.split("\n").find((l) => l.startsWith("data:")))
      .filter((l): l is string => Boolean(l))
      .map((l) => JSON.parse(l.slice(5).trim()) as { type: string; outcome?: { status: string; retryAt?: number } });
    const outcomeFrame = frames.find((f) => f.type === "outcome");
    expect(outcomeFrame?.outcome).toEqual({ status: "rate_limited", retryAt: RETRY_AT });
  });
});
