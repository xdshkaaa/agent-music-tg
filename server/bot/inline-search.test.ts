import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.TELEGRAM_BOT_TOKEN ??= "123456:test-token";
process.env.CRYPTOBOT_TOKEN ??= "test-crypto-token";

/**
 * Wiring tests for inline search ("@bot <query>" in any chat): it must answer
 * fast from audio_cache alone, warm cache misses in the background without
 * blocking the answer, stay open to non-allowlisted callers, and — critically
 * — never queue behind a slow generation from the same user (see the
 * sequentialize fix in ./index.ts). Drives real updates through `createBot`,
 * same pattern as group-search.test.ts.
 */

let searchImpl: (query: string) => Array<{ uri: string; title: string; artist: string; durationMs?: number }> = () => [];
const searchCalls: string[] = [];
mock.module("../music/registry", () => ({
  isMusicBackend: () => true,
  AVAILABLE_BACKENDS: ["youtube-music"],
  createMusicProvider: () => ({
    name: "youtube-music",
    async searchTracks(query: string) {
      searchCalls.push(query);
      return searchImpl(query);
    },
  }),
}));

let releaseGeneration: (() => void) | null = null;
mock.module("../core/run-generation", () => ({
  EXTEND_FREE_LIMIT: 3,
  async startGeneration(_db: unknown, _chatId: number, _prompt: string) {
    if (releaseGeneration) {
      await new Promise<void>((resolve) => {
        releaseGeneration = resolve;
      });
    }
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
const { inlineSearchRateLimiter, inlineExtractRateLimiter } = await import("../lib/rate-limit");
const {
  __resetInlineSearchForTests,
  __drainInlineSearchForTests,
  __setInlineSearchDepsForTests,
} = await import("./inline-search");
const { getCachedAudio, setCachedAudio } = await import("../audio/cache");
const { getInlineStats } = await import("../access/inline-usage-store");
const { env } = await import("../env");
import type { Extractor } from "../audio/extractor";
import type { AudioSender } from "../audio/deliver";

const USER_A = 111;
const STORAGE_CHAT = -100999;
const PRIVATE_CHAT = 555;
const BOT_ID = 987;
const BOT_USERNAME = "music_agentbot";

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "inline-search-test-"));
}

function fakeExtractor(): Extractor & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async extract(uri, targetDir) {
      calls.push(uri);
      const filePath = join(targetDir, `${uri.replace(":", "_")}.mp3`);
      writeFileSync(filePath, Buffer.alloc(16, 1));
      return { filePath, sizeBytes: 16, durationSeconds: 120 };
    },
    async probe() {
      return { available: true };
    },
  };
}

function fakeSender(): { sender: AudioSender; sent: { kind: "file_id" | "upload" | "text"; value: string }[] } {
  const sent: { kind: "file_id" | "upload" | "text"; value: string }[] = [];
  let uploads = 0;
  return {
    sent,
    sender: {
      async sendAudioByFileId(_chatId, fileId) {
        sent.push({ kind: "file_id", value: fileId });
      },
      async sendAudioFile(_chatId, filePath) {
        sent.push({ kind: "upload", value: filePath });
        return `file-id-${++uploads}`;
      },
      async sendText(_chatId, text) {
        sent.push({ kind: "text", value: text });
      },
    },
  };
}

function makeHarness() {
  const db = openDb(":memory:");
  const bot = createBot(db);
  const calls: ApiCall[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    if (method === "getMe") {
      return { ok: true, result: { id: BOT_ID, is_bot: true, first_name: "Bot", username: BOT_USERNAME } } as never;
    }
    if (method === "sendMessage" || method === "sendAudio") {
      return {
        ok: true,
        result: { message_id: calls.length + 1000, date: 0, chat: { id: STORAGE_CHAT, type: "channel" } },
      } as never;
    }
    if (method === "answerInlineQuery") {
      return { ok: true, result: true } as never;
    }
    return { ok: true, result: true } as never;
  });
  return {
    db,
    bot,
    calls,
    answers: () => calls.filter((c) => c.method === "answerInlineQuery"),
  };
}

function inlineQueryUpdate(query: string, fromId: number, updateId: number) {
  return {
    update_id: updateId,
    inline_query: {
      id: `iq-${updateId}`,
      from: { id: fromId, is_bot: false, first_name: "U" },
      query,
      offset: "",
    },
  };
}

function chosenInlineResultUpdate(resultId: string, fromId: number, updateId: number) {
  return {
    update_id: updateId,
    chosen_inline_result: {
      result_id: resultId,
      from: { id: fromId, is_bot: false, first_name: "U" },
      query: "whatever",
    },
  };
}

function privateTextUpdate(text: string, fromId: number, updateId: number) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId + 100,
      date: Math.floor(Date.now() / 1000),
      chat: { id: PRIVATE_CHAT, type: "private" },
      from: { id: fromId, is_bot: false, first_name: "P" },
      text,
    },
  };
}

let harness: ReturnType<typeof makeHarness>;

beforeEach(async () => {
  searchCalls.length = 0;
  searchImpl = () => [];
  releaseGeneration = null;
  inlineSearchRateLimiter.reset();
  inlineExtractRateLimiter.reset();
  __resetInlineSearchForTests();
  __setInlineSearchDepsForTests(null);
  env.audioStorageChatId = STORAGE_CHAT;
  harness = makeHarness();
  await harness.bot.init();
});

afterEach(() => {
  inlineSearchRateLimiter.reset();
  inlineExtractRateLimiter.reset();
  __setInlineSearchDepsForTests(null);
  env.audioStorageChatId = null;
});

describe("short or empty query", () => {
  test("answers empty without searching", async () => {
    await harness.bot.handleUpdate(inlineQueryUpdate("a", USER_A, 1) as never);
    await __drainInlineSearchForTests();

    expect(searchCalls).toEqual([]);
    const answers = harness.answers();
    expect(answers.length).toBe(1);
    expect(answers[0]!.payload.results).toEqual([]);
  });
});

describe("cache hit", () => {
  test("answers with cached audio, no warm-up", async () => {
    setCachedAudio(harness.db, {
      uri: "ytm:cached",
      tgFileId: "cached-file-id",
      title: "Cached Track",
      artist: "Someone",
      durationMs: 180_000,
      sizeBytes: 1000,
    });
    searchImpl = () => [{ uri: "ytm:cached", title: "Cached Track", artist: "Someone", durationMs: 180_000 }];
    const extractor = fakeExtractor();
    const { sender } = fakeSender();
    __setInlineSearchDepsForTests({ sender, extractor, scratchDir: scratch() });

    await harness.bot.handleUpdate(inlineQueryUpdate("cached track", USER_A, 1) as never);
    await __drainInlineSearchForTests();

    const answers = harness.answers();
    expect(answers.length).toBe(1);
    const results = answers[0]!.payload.results as Array<Record<string, unknown>>;
    expect(results).toEqual([{ type: "audio", id: "ytm:cached", audio_file_id: "cached-file-id" }]);
    expect(answers[0]!.payload.button).toBeUndefined();
    expect(extractor.calls.length).toBe(0);
  });
});

describe("cache miss", () => {
  test("answers empty with a warming button, then warms in the background so a repeat query finds it cached", async () => {
    searchImpl = () => [{ uri: "ytm:fresh", title: "Fresh Track", artist: "Band", durationMs: 200_000 }];
    const extractor = fakeExtractor();
    const { sender, sent } = fakeSender();
    __setInlineSearchDepsForTests({ sender, extractor, scratchDir: scratch() });

    await harness.bot.handleUpdate(inlineQueryUpdate("fresh track", USER_A, 1) as never);
    await __drainInlineSearchForTests();

    const firstAnswer = harness.answers()[0]!;
    expect(firstAnswer.payload.results).toEqual([]);
    expect(firstAnswer.payload.button).toBeDefined();
    expect(extractor.calls).toEqual(["ytm:fresh"]);
    expect(sent.filter((s) => s.kind === "upload").length).toBe(1);
    expect(getCachedAudio(harness.db, "ytm:fresh")?.tgFileId).toBe("file-id-1");

    await harness.bot.handleUpdate(inlineQueryUpdate("fresh track", USER_A, 2) as never);
    await __drainInlineSearchForTests();

    const secondAnswer = harness.answers()[1]!;
    expect(secondAnswer.payload.results).toEqual([{ type: "audio", id: "ytm:fresh", audio_file_id: "file-id-1" }]);
    expect(extractor.calls.length).toBe(1); // no second extraction

    expect(getInlineStats(harness.db).searches).toBe(2);
  });

  test("without AUDIO_STORAGE_CHAT_ID, answers empty and never warms", async () => {
    env.audioStorageChatId = null;
    searchImpl = () => [{ uri: "ytm:nostorage", title: "No Storage", artist: "Band" }];
    const extractor = fakeExtractor();
    const { sender } = fakeSender();
    __setInlineSearchDepsForTests({ sender, extractor, scratchDir: scratch() });

    await harness.bot.handleUpdate(inlineQueryUpdate("no storage", USER_A, 1) as never);
    await __drainInlineSearchForTests();

    expect(extractor.calls.length).toBe(0);
    expect(getCachedAudio(harness.db, "ytm:nostorage")).toBeNull();
  });
});

describe("inlineExtractRateLimiter", () => {
  test("a 6th cache-miss in the window answers but never reaches the extractor", async () => {
    searchImpl = () => [{ uri: "ytm:limited", title: "Limited", artist: "Band" }];
    const extractor = fakeExtractor();
    const { sender } = fakeSender();
    __setInlineSearchDepsForTests({ sender, extractor, scratchDir: scratch() });

    for (let i = 0; i < 5; i++) expect(inlineExtractRateLimiter.check(USER_A)).toBe(false);

    await harness.bot.handleUpdate(inlineQueryUpdate("limited", USER_A, 1) as never);
    await __drainInlineSearchForTests();

    expect(extractor.calls.length).toBe(0);
    expect(harness.answers().length).toBe(1);
  });
});

describe("inlineSearchRateLimiter", () => {
  test("an exhausted budget answers empty without calling runSearch", async () => {
    searchImpl = () => [{ uri: "ytm:x", title: "X", artist: "Y" }];
    for (let i = 0; i < 60; i++) expect(inlineSearchRateLimiter.check(USER_A)).toBe(false);

    await harness.bot.handleUpdate(inlineQueryUpdate("anything", USER_A, 1) as never);
    await __drainInlineSearchForTests();

    expect(searchCalls).toEqual([]);
    expect(harness.answers()[0]!.payload.results).toEqual([]);
  });
});

describe("chosen_inline_result", () => {
  test("bumps the track counter", async () => {
    // A choice always follows a query from the same user, which is what
    // creates the inline_usage row (bumpInlineTrack only updates, mirroring
    // bumpGroupTrack in group-chats-store.ts) — so seed one first.
    await harness.bot.handleUpdate(inlineQueryUpdate("anything", USER_A, 1) as never);
    await __drainInlineSearchForTests();

    await harness.bot.handleUpdate(chosenInlineResultUpdate("ytm:whatever", USER_A, 2) as never);
    expect(getInlineStats(harness.db).tracks).toBe(1);
  });
});

describe("open access", () => {
  test("a caller with no allowlist row still gets real results", async () => {
    searchImpl = () => [{ uri: "ytm:open", title: "Open", artist: "Access" }];
    setCachedAudio(harness.db, {
      uri: "ytm:open",
      tgFileId: "open-file-id",
      title: "Open",
      artist: "Access",
      durationMs: 100_000,
      sizeBytes: 500,
    });

    await harness.bot.handleUpdate(inlineQueryUpdate("open", USER_A, 1) as never);
    await __drainInlineSearchForTests();

    const results = harness.answers()[0]!.payload.results as Array<Record<string, unknown>>;
    expect(results).toEqual([{ type: "audio", id: "ytm:open", audio_file_id: "open-file-id" }]);
  });
});

describe("isolation from a slow generation (sequentialize fix)", () => {
  test("an inline query from the same user answers immediately instead of queuing behind it", async () => {
    harness.db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [PRIVATE_CHAT]);
    searchImpl = () => [];

    let releaseCalled = false;
    releaseGeneration = () => {
      releaseCalled = true;
    };
    // Same id for the private chat and the inline query's `from` — a private
    // chat's id equals the user's own id, so this is the exact scenario the
    // sequentialize fix targets: without it, both updates share one queue key.
    const generationPromise = harness.bot.handleUpdate(privateTextUpdate("собери плейлист про дождь", PRIVATE_CHAT, 1) as never);
    // Let the generation handler actually start and park on its gate.
    await new Promise((r) => setTimeout(r, 0));
    expect(releaseCalled).toBe(false); // still parked — confirms the gate is actually blocking

    await harness.bot.handleUpdate(inlineQueryUpdate("anything", PRIVATE_CHAT, 2) as never);
    await __drainInlineSearchForTests();

    // The inline answer landed while the generation is still pending.
    expect(harness.answers().length).toBe(1);
    expect(releaseCalled).toBe(false);

    releaseGeneration();
    await generationPromise;
  });
});
