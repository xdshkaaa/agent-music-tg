import { describe, expect, test } from "bun:test";
import { openDb, type AppDb } from "../db";
import { addRequiredChannel, setCachedMembership, getCachedMembership } from "./channel-gate-store";
import type { RequiredChannel } from "./channel-gate-store";
import { checkChannelMembership, checkAllMemberships } from "./subscription-check";
import type { MembershipCheckDeps } from "./subscription-check";

const CHAT_ID = 555001;
const CHANNEL_ID = -100123;

function freshDb(): AppDb {
  return openDb(":memory:");
}

function channel(db: AppDb): RequiredChannel {
  addRequiredChannel(db, CHANNEL_ID, "Test Channel", "testchannel", null);
  return { channelId: CHANNEL_ID, username: "testchannel", inviteLink: null, title: "Test Channel", addedBy: null, createdAt: 0 };
}

function deps(status: string, error?: unknown): MembershipCheckDeps {
  return {
    getChatMember: async () => {
      if (error) throw error;
      return { status };
    },
  };
}

describe("checkChannelMembership", () => {
  test("passive check within TTL returns the cached value without calling getChatMember", async () => {
    const db = freshDb();
    const ch = channel(db);
    setCachedMembership(db, CHAT_ID, CHANNEL_ID, true);

    let called = false;
    const d: MembershipCheckDeps = {
      getChatMember: async () => {
        called = true;
        return { status: "left" };
      },
    };

    const result = await checkChannelMembership(db, d, ch, CHAT_ID, false);
    expect(result).toBe(true);
    expect(called).toBe(false);
  });

  test("passive check with no cache entry calls getChatMember and caches the result", async () => {
    const db = freshDb();
    const ch = channel(db);

    const result = await checkChannelMembership(db, deps("member"), ch, CHAT_ID, false);
    expect(result).toBe(true);
    expect(getCachedMembership(db, CHAT_ID, CHANNEL_ID)?.isMember).toBe(true);
  });

  test("forced check always calls getChatMember even with a fresh cache entry, and overwrites the cache", async () => {
    const db = freshDb();
    const ch = channel(db);
    setCachedMembership(db, CHAT_ID, CHANNEL_ID, false);

    let called = false;
    const d: MembershipCheckDeps = {
      getChatMember: async () => {
        called = true;
        return { status: "member" };
      },
    };

    const result = await checkChannelMembership(db, d, ch, CHAT_ID, true);
    expect(called).toBe(true);
    expect(result).toBe(true);
    expect(getCachedMembership(db, CHAT_ID, CHANNEL_ID)?.isMember).toBe(true);
  });

  test("a 429 from Telegram falls back to the cached value if one exists", async () => {
    const db = freshDb();
    const ch = channel(db);
    setCachedMembership(db, CHAT_ID, CHANNEL_ID, true);

    // force=true bypasses the TTL read but must still fall back on error.
    const result = await checkChannelMembership(db, deps("", { error_code: 429 }), ch, CHAT_ID, true);
    expect(result).toBe(true);
  });

  test("a 429 from Telegram with no cached value reports not-a-member", async () => {
    const db = freshDb();
    const ch = channel(db);

    const result = await checkChannelMembership(db, deps("", { error_code: 429 }), ch, CHAT_ID, true);
    expect(result).toBe(false);
  });

  test("administrator and creator statuses count as membership", async () => {
    const db = freshDb();
    const ch = channel(db);
    expect(await checkChannelMembership(db, deps("administrator"), ch, CHAT_ID, false)).toBe(true);

    const db2 = freshDb();
    const ch2 = channel(db2);
    expect(await checkChannelMembership(db2, deps("creator"), ch2, CHAT_ID, false)).toBe(true);
  });
});

describe("checkAllMemberships", () => {
  test("returns true only if every channel is a member", async () => {
    const db = freshDb();
    addRequiredChannel(db, 1, "A", "a", null);
    addRequiredChannel(db, 2, "B", "b", null);
    const channels: RequiredChannel[] = [
      { channelId: 1, username: "a", inviteLink: null, title: "A", addedBy: null, createdAt: 0 },
      { channelId: 2, username: "b", inviteLink: null, title: "B", addedBy: null, createdAt: 0 },
    ];

    const d: MembershipCheckDeps = {
      getChatMember: async (channelId) => ({ status: channelId === 1 ? "member" : "left" }),
    };

    expect(await checkAllMemberships(db, d, channels, CHAT_ID, false)).toBe(false);
  });
});
