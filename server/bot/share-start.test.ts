import { describe, expect, test } from "bun:test";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

const { openDb } = await import("../db");
const { upsertUser } = await import("../access/users-store");
const { publishShare, getShare } = await import("../access/shares-store");
const { applyReferral } = await import("../access/referral-store");
const { parseShareToken } = await import("../access/share-link");

const OWNER = 666001;
const NEWCOMER = 666002;

/**
 * Mirrors the /start pl_<token> path in bot/index.ts: resolve the token to its
 * owner, then credit through the same referral entry point the ref_ links use.
 */
function handleShareStart(db: ReturnType<typeof openDb>, chatId: number, startParam: string): boolean {
  const token = parseShareToken(startParam);
  if (!token) return false;
  const share = getShare(db, token);
  if (!share || share.revokedAt !== null) return false;
  return applyReferral(db, share.ownerChatId, chatId);
}

describe("/start pl_<token>", () => {
  test("credits the share owner once and never for a self-open", () => {
    const db = openDb(":memory:");
    db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [OWNER]);
    upsertUser(db, OWNER);
    upsertUser(db, NEWCOMER);
    const share = publishShare(db, OWNER, {
      sourceKind: "generation",
      sourceId: 1,
      name: "Вечерний драйв",
      prompt: "дождь",
      tracks: [{ uri: "ytm:a", title: "One", artist: "A" }],
    });

    expect(handleShareStart(db, NEWCOMER, `pl_${share.token}`)).toBe(true);
    expect(handleShareStart(db, NEWCOMER, `pl_${share.token}`)).toBe(false);
    expect(handleShareStart(db, OWNER, `pl_${share.token}`)).toBe(false);
  });

  test("a revoked share credits nobody", () => {
    const db = openDb(":memory:");
    db.run("INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 0)", [OWNER]);
    upsertUser(db, OWNER);
    upsertUser(db, NEWCOMER);
    const share = publishShare(db, OWNER, {
      sourceKind: "playlist",
      sourceId: 7,
      name: "Тихое утро",
      prompt: null,
      tracks: [{ uri: "ytm:b", title: "Two", artist: "B" }],
    });
    db.run("UPDATE playlist_shares SET revoked_at = unixepoch() WHERE token = ?", [share.token]);

    expect(handleShareStart(db, NEWCOMER, `pl_${share.token}`)).toBe(false);
  });
});
