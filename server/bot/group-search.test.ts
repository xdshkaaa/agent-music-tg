import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.TELEGRAM_BOT_TOKEN ??= "123456:test-token";
process.env.CRYPTOBOT_TOKEN ??= "test-crypto-token";

/**
 * Wiring tests for the group-chat keyword search: a group must never touch
 * private-chat state (allowlist, users, sessions), and repeat requests for
 * the same track must reuse the audio_cache file_id instead of re-extracting.
 * Drives real updates through `createBot` — see routing.test.ts for the same
 * pattern on the private-chat side.
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
const { searchRateLimiter, groupExtractRateLimiter } = await import("../lib/rate-limit");
const {
  parseGroupQuery,
  __resetGroupSearchForTests,
  __drainGroupSearchForTests,
  __setGroupSearchDepsForTests,
} = await import("./group-search");
const { getCachedAudio, setCachedAudio } = await import("../audio/cache");
const { getGroupStats, getGroupChat } = await import("../access/group-chats-store");
const { countUsers } = await import("../access/users-store");
const { getPendingInput, setPendingInput } = await import("./session");
import type { Extractor } from "../audio/extractor";
import type { AudioMeta, AudioSender } from "../audio/deliver";

const GROUP_CHAT = -100123456;
const PRIVATE_CHAT = 555;
const USER_A = 111;
const USER_B = 222;
const BOT_ID = 987;
const BOT_USERNAME = "music_agentbot";

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "group-search-test-"));
}

/** Records every extract() call; blocks on `gate` when one is supplied, so tests can pin timing. */
function fakeExtractor(opts: { failUris?: string[]; gate?: Promise<void> } = {}): Extractor & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async extract(uri, targetDir) {
      calls.push(uri);
      if (opts.gate) await opts.gate;
      if (opts.failUris?.includes(uri)) throw new Error(`extract failed: ${uri}`);
      const filePath = join(targetDir, `${uri.replace(":", "_")}.mp3`);
      writeFileSync(filePath, Buffer.alloc(16, 1));
      return { filePath, sizeBytes: 16, durationSeconds: 120 };
    },
    async probe() {
      return { available: true };
    },
  };
}

function fakeSender(): {
  sender: AudioSender;
  sent: { kind: "file_id" | "upload" | "text"; value: string; meta?: AudioMeta }[];
} {
  const sent: { kind: "file_id" | "upload" | "text"; value: string; meta?: AudioMeta }[] = [];
  let uploads = 0;
  return {
    sent,
    sender: {
      async sendAudioByFileId(_chatId, fileId, meta) {
        sent.push({ kind: "file_id", value: fileId, meta });
      },
      async sendAudioFile(_chatId, filePath, meta) {
        sent.push({ kind: "upload", value: filePath, meta });
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
        result: { message_id: calls.length + 1000, date: 0, chat: { id: GROUP_CHAT, type: "group" } },
      } as never;
    }
    return { ok: true, result: true } as never;
  });
  return {
    db,
    bot,
    calls,
    sentMessages: () => calls.filter((c) => c.method === "sendMessage"),
    deletedMessageIds: () => calls.filter((c) => c.method === "deleteMessage").map((c) => c.payload.message_id),
  };
}

function groupTextUpdate(text: string, fromId: number, updateId: number, replyToBot = false) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId + 100,
      date: Math.floor(Date.now() / 1000),
      chat: { id: GROUP_CHAT, type: "group", title: "Test Group" },
      from: { id: fromId, is_bot: false, first_name: "U" },
      text,
      ...(replyToBot
        ? {
            reply_to_message: {
              message_id: 1,
              date: 0,
              chat: { id: GROUP_CHAT, type: "group", title: "Test Group" },
              from: { id: BOT_ID, is_bot: true, first_name: "Bot", username: BOT_USERNAME },
            },
          }
        : {}),
    },
  };
}

function privateTextUpdate(text: string, updateId: number) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId + 100,
      date: Math.floor(Date.now() / 1000),
      chat: { id: PRIVATE_CHAT, type: "private" },
      from: { id: PRIVATE_CHAT, is_bot: false, first_name: "P" },
      text,
    },
  };
}

function myChatMemberUpdate(status: "member" | "left", updateId: number) {
  return {
    update_id: updateId,
    my_chat_member: {
      chat: { id: GROUP_CHAT, type: "group", title: "Test Group" },
      from: { id: USER_A, is_bot: false, first_name: "U" },
      date: Math.floor(Date.now() / 1000),
      old_chat_member: { user: { id: BOT_ID, is_bot: true, first_name: "Bot" }, status: "left" },
      new_chat_member: { user: { id: BOT_ID, is_bot: true, first_name: "Bot" }, status },
    },
  };
}

let harness: ReturnType<typeof makeHarness>;

beforeEach(async () => {
  searchCalls.length = 0;
  generateCalls.length = 0;
  searchImpl = () => [];
  searchRateLimiter.reset();
  groupExtractRateLimiter.reset();
  __resetGroupSearchForTests();
  __setGroupSearchDepsForTests(null);
  harness = makeHarness();
  await harness.bot.init();
});

afterEach(() => {
  searchRateLimiter.reset();
  groupExtractRateLimiter.reset();
  __setGroupSearchDepsForTests(null);
});

describe("parseGroupQuery", () => {
  test("keyword at the start triggers, case-insensitively", () => {
    expect(parseGroupQuery("найти последняя любовь", BOT_USERNAME)).toBe("последняя любовь");
    expect(parseGroupQuery("НАЙТИ Motorama", BOT_USERNAME)).toBe("Motorama");
  });

  test("keyword only counts at the start of the message", () => {
    expect(parseGroupQuery("я найти не могу", BOT_USERNAME)).toBeNull();
  });

  test("a mention without the keyword still triggers", () => {
    expect(parseGroupQuery(`@${BOT_USERNAME} Motorama`, BOT_USERNAME)).toBe("Motorama");
  });

  test("mention plus keyword strips both", () => {
    expect(parseGroupQuery(`@${BOT_USERNAME} найти Motorama`, BOT_USERNAME)).toBe("Motorama");
  });

  test("plain text with no mention or keyword does not trigger", () => {
    expect(parseGroupQuery("просто болтаем", BOT_USERNAME)).toBeNull();
  });

  test("an empty query after the keyword does not trigger", () => {
    expect(parseGroupQuery("найти", BOT_USERNAME)).toBeNull();
    expect(parseGroupQuery("найти   ", BOT_USERNAME)).toBeNull();
  });
});

describe("cache hit", () => {
  test("sends by file_id and never extracts or posts a status message", async () => {
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
    const { sender, sent } = fakeSender();
    __setGroupSearchDepsForTests({ sender, extractor, scratchDir: scratch() });

    await harness.bot.handleUpdate(groupTextUpdate("найти cached track", USER_A, 1) as never);
    await __drainGroupSearchForTests();

    expect(extractor.calls.length).toBe(0);
    expect(sent).toEqual([
      { kind: "file_id", value: "cached-file-id", meta: expect.objectContaining({ replyToMessageId: 101 }) },
    ]);
    // The caption links back to the bot with attribution, so it's findable outside the group.
    expect(sent[0]?.meta?.caption).toBe(
      `<a href="https://t.me/${BOT_USERNAME}?start=src_group-search">поиск музыки</a>`,
    );
    // No "Ищу…" status line, since a cache hit never needs one.
    expect(harness.sentMessages().length).toBe(0);
  });
});

describe("cache miss", () => {
  test("extracts once, caches the result, and a repeat request from another user reuses it", async () => {
    searchImpl = () => [{ uri: "ytm:fresh", title: "Fresh Track", artist: "Band", durationMs: 200_000 }];
    const extractor = fakeExtractor();
    const { sender, sent } = fakeSender();
    __setGroupSearchDepsForTests({ sender, extractor, scratchDir: scratch() });

    await harness.bot.handleUpdate(groupTextUpdate("найти fresh track", USER_A, 1) as never);
    await __drainGroupSearchForTests();

    expect(extractor.calls).toEqual(["ytm:fresh"]);
    expect(sent).toEqual([
      { kind: "upload", value: expect.stringContaining("ytm_fresh"), meta: expect.anything() },
    ]);
    expect(getCachedAudio(harness.db, "ytm:fresh")?.tgFileId).toBe("file-id-1");
    // No "Ищу…" status message is posted or deleted anymore — the typing
    // indicator is the only in-progress signal.
    expect(harness.sentMessages().length).toBe(0);
    expect(harness.deletedMessageIds().length).toBe(0);

    // Second request, different user, same track: cache hit — no second extract.
    await harness.bot.handleUpdate(groupTextUpdate("найти fresh track", USER_B, 2) as never);
    await __drainGroupSearchForTests();

    expect(extractor.calls).toEqual(["ytm:fresh"]);
    expect(sent).toEqual([
      { kind: "upload", value: expect.stringContaining("ytm_fresh"), meta: expect.anything() },
      { kind: "file_id", value: "file-id-1", meta: expect.anything() },
    ]);
    expect(harness.sentMessages().length).toBe(0); // still no status message

    const stats = getGroupStats(harness.db);
    expect(stats.searches).toBe(2);
    expect(stats.tracks).toBe(2);
  });
});

describe("concurrent requests for the same track", () => {
  test("only one extraction runs; the second request waits on the first", async () => {
    searchImpl = () => [{ uri: "ytm:concurrent", title: "Concurrent Track", artist: "Band", durationMs: 150_000 }];
    let releaseExtract!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseExtract = resolve;
    });
    const extractor = fakeExtractor({ gate });
    const { sender, sent } = fakeSender();
    __setGroupSearchDepsForTests({ sender, extractor, scratchDir: scratch() });

    await harness.bot.handleUpdate(groupTextUpdate("найти concurrent track", USER_A, 1) as never);
    // Flush every microtask so execution is parked inside the gated extract()
    // call before the second request arrives.
    await new Promise((r) => setTimeout(r, 0));

    await harness.bot.handleUpdate(groupTextUpdate("найти concurrent track", USER_B, 2) as never);
    await new Promise((r) => setTimeout(r, 0));

    expect(extractor.calls.length).toBe(1); // second request found the first in flight, didn't start its own

    releaseExtract();
    await __drainGroupSearchForTests();

    expect(extractor.calls.length).toBe(1);
    expect(sent.filter((s) => s.kind === "upload").length).toBe(1);
  });
});

describe("reply to bot", () => {
  test("a reply with no keyword or mention does not trigger a search", async () => {
    await harness.bot.handleUpdate(groupTextUpdate("где?", USER_A, 1, true) as never);
    await __drainGroupSearchForTests();

    expect(searchCalls).toEqual([]);
    expect(harness.sentMessages().length).toBe(0);
  });
});

describe("isolation from private-chat state", () => {
  test("a group message never touches users/sessions/generation", async () => {
    searchImpl = () => [];
    await harness.bot.handleUpdate(groupTextUpdate("найти anything", USER_A, 1) as never);
    await __drainGroupSearchForTests();

    expect(countUsers(harness.db)).toBe(0);
    expect(generateCalls).toEqual([]);
    expect(getPendingInput(harness.db, GROUP_CHAT)).toBeNull();
  });

  test("a private message is unaffected and still reaches generation once armed", async () => {
    harness.db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [PRIVATE_CHAT]);
    setPendingInput(harness.db, PRIVATE_CHAT, "awaiting_prompt");
    await harness.bot.handleUpdate(privateTextUpdate("собери плейлист про дождь", 1) as never);
    expect(generateCalls).toEqual(["собери плейлист про дождь"]);
    expect(countUsers(harness.db)).toBe(1);
  });
});

describe("groupExtractRateLimiter", () => {
  test("a 6th cache-miss in the window is dropped before it reaches the extractor", async () => {
    searchImpl = () => [{ uri: "ytm:limited", title: "Limited", artist: "Band" }];
    const extractor = fakeExtractor();
    const { sender } = fakeSender();
    __setGroupSearchDepsForTests({ sender, extractor, scratchDir: scratch() });

    // Exhaust the 5/min budget directly, same budget the delivery path checks.
    for (let i = 0; i < 5; i++) expect(groupExtractRateLimiter.check(GROUP_CHAT)).toBe(false);

    await harness.bot.handleUpdate(groupTextUpdate("найти limited", USER_A, 1) as never);
    await __drainGroupSearchForTests();

    expect(extractor.calls.length).toBe(0);
    expect(harness.sentMessages().length).toBe(0); // no "Ищу…" line either
  });
});

describe("my_chat_member", () => {
  test("joining records the group and leaving marks it without dropping counters", async () => {
    await harness.bot.handleUpdate(myChatMemberUpdate("member", 1) as never);
    expect(getGroupChat(harness.db, GROUP_CHAT)?.leftAt).toBeNull();
    expect(getGroupChat(harness.db, GROUP_CHAT)?.title).toBe("Test Group");

    await harness.bot.handleUpdate(myChatMemberUpdate("left", 2) as never);
    expect(getGroupChat(harness.db, GROUP_CHAT)?.leftAt).not.toBeNull();
  });
});
