import { describe, expect, test, mock } from "bun:test";
import { createHmac } from "node:crypto";

process.env.TELEGRAM_BOT_TOKEN = "test-token";
const TEST_CHAT = 888881;

// Replace the real generation entrypoint so the SSE test never needs a live
// LLM provider — we drive the onEvent callback with a structured event and
// resolve with a fixed outcome.
mock.module("../core/run-generation", () => ({
  startGeneration: async (_db: unknown, _chatId: number, _prompt: string, onEvent?: (e: unknown) => void) => {
    onEvent?.({ kind: "tool_call", id: "call-1", name: "searchTrack", args: { artist: "Burial", title: "Archangel" } });
    onEvent?.({ kind: "tool_result", id: "call-1", ok: true, result: { artist: "Burial", title: "Archangel", uri: "ytm:x" } });
    return {
      status: "ok",
      playlist: { name: "Test", tracks: [{ artist: "Burial", title: "Archangel", uri: "ytm:x" }] },
    };
  },
  resumeGeneration: async () => ({ status: "ok", playlist: { name: "Test", tracks: [] } }),
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

describe("/generate/stream SSE payload shape", () => {
  test("progress frames carry type: agent_event with the raw AgentEvent", async () => {
    const db = freshDb();
    const app = createApiRoutes(db);
    const res = await app.request("/generate/stream", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": buildInitData(TEST_CHAT), "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Burial" }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();

    const frames = body
      .split("\n\n")
      .map((f) => f.split("\n").find((l) => l.startsWith("data:")))
      .filter((l): l is string => Boolean(l))
      .map((l) => JSON.parse(l.slice(5).trim()));

    const eventFrame = frames.find((f) => f.type === "agent_event");
    expect(eventFrame).toBeDefined();
    expect(eventFrame.event).toEqual({
      kind: "tool_call",
      id: "call-1",
      name: "searchTrack",
      args: { artist: "Burial", title: "Archangel" },
    });

    const outcomeFrame = frames.find((f) => f.type === "outcome");
    expect(outcomeFrame?.outcome?.status).toBe("ok");
  });
});
