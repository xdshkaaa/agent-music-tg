import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

process.env.TELEGRAM_BOT_TOKEN ??= "123456:test-token";
process.env.CRYPTOBOT_TOKEN ??= "test-crypto-token";

/**
 * Wiring tests for the bot's text and callback routing.
 *
 * grammY stops the middleware chain at the first handler that does not call
 * next(), so handler *registration order* is load-bearing and invisible to unit
 * tests of the view builders. This file drives real updates through the whole
 * stack to pin that behaviour down.
 */

const searchCalls: { query: string; limit?: number }[] = [];
mock.module("../music/registry", () => ({
  isMusicBackend: () => true,
  AVAILABLE_BACKENDS: ["youtube-music"],
  createMusicProvider: () => ({
    name: "youtube-music",
    async searchTracks(query: string, limit?: number) {
      searchCalls.push({ query, limit });
      return [
        { uri: "ytm:one", title: "Alps", artist: "Motorama", durationMs: 200_000 },
        { uri: "ytm:two", title: "Above", artist: "Motorama", durationMs: 190_000 },
      ];
    },
  }),
}));

const generateCalls: string[] = [];
mock.module("../core/run-generation", () => ({
  EXTEND_FREE_LIMIT: 3,
  async startGeneration(_db: unknown, _chatId: number, prompt: string) {
    generateCalls.push(prompt);
    return { status: "error", message: "stub" };
  },
  async resumeGeneration() {
    return { status: "error", message: "stub" };
  },
  async extendGeneration() {
    return { status: "error", message: "stub" };
  },
  setPrewarmStreamResolver() {},
  setVerificationExtractor() {},
}));

const { openDb } = await import("../db");
const { createBot } = await import("./index");
const { searchRateLimiter } = await import("../lib/rate-limit");
const { __resetSearchSessionsForTests } = await import("./search");
const { getPendingInput } = await import("./session");

const CHAT = 987654;

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

function makeHarness() {
  const db = openDb(":memory:");
  db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [CHAT]);
  const bot = createBot(db);
  const calls: ApiCall[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    if (method === "sendMessage") {
      return { ok: true, result: { message_id: 1, date: 0, chat: { id: CHAT, type: "private" } } } as never;
    }
    return { ok: true, result: true } as never;
  });
  return { db, bot, calls, sent: () => calls.filter((c) => c.method === "sendMessage") };
}

function textUpdate(text: string, updateId = 1) {
  const isCommand = text.startsWith("/");
  return {
    update_id: updateId,
    message: {
      message_id: updateId + 100,
      date: Math.floor(Date.now() / 1000),
      chat: { id: CHAT, type: "private" },
      from: { id: CHAT, is_bot: false, first_name: "T" },
      text,
      ...(isCommand
        ? { entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }] }
        : {}),
    },
  };
}

function callbackUpdate(data: string, updateId = 1) {
  return {
    update_id: updateId,
    callback_query: {
      id: String(updateId),
      from: { id: CHAT, is_bot: false, first_name: "T" },
      chat_instance: "x",
      data,
      message: {
        message_id: 5,
        date: Math.floor(Date.now() / 1000),
        chat: { id: CHAT, type: "private" },
        text: "prev",
      },
    },
  };
}

let harness: ReturnType<typeof makeHarness>;

beforeEach(async () => {
  searchCalls.length = 0;
  generateCalls.length = 0;
  searchRateLimiter.reset();
  __resetSearchSessionsForTests();
  harness = makeHarness();
  await harness.bot.init().catch(() => {
    // getMe is stubbed; a failure here does not affect handleUpdate.
  });
});

afterEach(() => {
  searchRateLimiter.reset();
});

describe("/search", () => {
  test("runs the query and renders the first page of results", async () => {
    await harness.bot.handleUpdate(textUpdate("/search мотогонки") as never);
    expect(searchCalls[0]?.query).toBe("мотогонки");
    const text = String(harness.sent()[0]?.payload.text ?? "");
    expect(text).toContain("Поиск: мотогонки");
    expect(text).toContain("1. <b>Alps</b>");
  });

  test("with no query it asks for one and arms the next message", async () => {
    await harness.bot.handleUpdate(textUpdate("/search") as never);
    expect(searchCalls).toHaveLength(0);
    expect(getPendingInput(harness.db, CHAT)?.kind).toBe("awaiting_search");
  });

  test("shares its rate-limit budget with the Mini App's /api/search", async () => {
    // Spend the whole budget as the API surface would.
    for (let i = 0; i < 20; i++) searchRateLimiter.check(CHAT);
    await harness.bot.handleUpdate(textUpdate("/search инди") as never);
    expect(searchCalls).toHaveLength(0);
    expect(String(harness.sent()[0]?.payload.text ?? "")).toContain("Слишком много запросов");
  });
});

describe("plain text routing", () => {
  test("is treated as an AI prompt by default", async () => {
    await harness.bot.handleUpdate(textUpdate("грустный инди для дождя") as never);
    expect(generateCalls).toEqual(["грустный инди для дождя"]);
    expect(searchCalls).toHaveLength(0);
  });

  test("goes to search instead while the search prompt is armed", async () => {
    await harness.bot.handleUpdate(callbackUpdate("nav:search") as never);
    expect(getPendingInput(harness.db, CHAT)?.kind).toBe("awaiting_search");

    await harness.bot.handleUpdate(textUpdate("motorama", 2) as never);
    expect(searchCalls[0]?.query).toBe("motorama");
    expect(generateCalls).toHaveLength(0);
  });

  test("the armed state is consumed, so the next message is a prompt again", async () => {
    await harness.bot.handleUpdate(callbackUpdate("nav:search") as never);
    await harness.bot.handleUpdate(textUpdate("motorama", 2) as never);
    await harness.bot.handleUpdate(textUpdate("что-нибудь бодрое", 3) as never);
    expect(generateCalls).toEqual(["что-нибудь бодрое"]);
  });

  test("still ignores unknown slash commands", async () => {
    await harness.bot.handleUpdate(textUpdate("/definitelynotacommand") as never);
    expect(generateCalls).toHaveLength(0);
    expect(searchCalls).toHaveLength(0);
  });
});

describe("callback routing", () => {
  // nav:search must reach the search module, not the generic nav:* menu switch.
  test("nav:search is not swallowed by the generic nav router", async () => {
    await harness.bot.handleUpdate(callbackUpdate("nav:search") as never);
    const edited = harness.calls.find((c) => c.method === "editMessageText");
    expect(String(edited?.payload.text ?? "")).toContain("Поиск по каталогу");
  });

  test("nav:generate arms the prompt flow", async () => {
    await harness.bot.handleUpdate(callbackUpdate("nav:generate") as never);
    expect(getPendingInput(harness.db, CHAT)?.kind).toBe("awaiting_prompt");
  });

  test("paging edits the same message rather than sending a new one", async () => {
    await harness.bot.handleUpdate(textUpdate("/search инди") as never);
    const sentBefore = harness.sent().length;
    await harness.bot.handleUpdate(callbackUpdate("srch:p:0", 2) as never);
    expect(harness.sent().length).toBe(sentBefore);
    expect(harness.calls.some((c) => c.method === "editMessageText")).toBe(true);
  });

  test("a stale result button explains itself instead of failing silently", async () => {
    __resetSearchSessionsForTests();
    await harness.bot.handleUpdate(callbackUpdate("srch:dl:0") as never);
    const answer = harness.calls.find((c) => c.method === "answerCallbackQuery");
    expect(String(answer?.payload.text ?? "")).toContain("устарели");
  });
});
