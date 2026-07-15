import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

// Fake the LLM/music layers so generation outcomes are fully controllable and
// no provider credentials or network are needed.
mock.module("../agent/registry", () => ({
  isProviderId: () => true,
  createProvider: () => ({}),
  MissingCredentialError: class MissingCredentialError extends Error {},
}));
mock.module("../music/registry", () => ({
  isMusicBackend: () => true,
  createMusicProvider: () => ({}),
}));

const actualGp = await import("./generate-playlist");
let generateImpl: () => Promise<{ playlist: { name: string; tracks: { artist: string; title: string; uri: string }[] } }>;
mock.module("./generate-playlist", () => ({
  ...actualGp,
  generatePlaylist: () => generateImpl(),
}));

const { env } = await import("../env");
const { openDb } = await import("../db");
const { upsertUser, addCredits, extendSubscription, getUser } = await import("../access/users-store");
const { checkSubscriptionRateLimit } = await import("../access/entitlements");
const { insertGeneration } = await import("../access/generations-store");
const { startGeneration, resumeGeneration, extendGeneration } = await import("./run-generation");
const { ClarifyNeededError, NoTracksResolvedError } = actualGp;

const CHAT = 424242;
// Rich prompt so the rule-based clarify gate never intercepts it.
const PROMPT = "меланхоличный эмбиент для дождливого вечера";

const PLAYLIST = {
  name: "Тест",
  tracks: [{ artist: "Burial", title: "Archangel", uri: "ytm:x" }],
};

function freshDb() {
  const db = openDb(":memory:");
  upsertUser(db, CHAT);
  db.query(`UPDATE users SET credits = 0 WHERE chat_id = ?`).run(CHAT);
  return db;
}

function backdateGenerations(db: ReturnType<typeof freshDb>, secondsAgo: number) {
  db.query(`UPDATE generations SET created_at = ? WHERE chat_id = ?`)
    .run(Math.floor(Date.now() / 1000) - secondsAgo, CHAT);
}

const saved = { paymentsEnabled: env.paymentsEnabled, limit: env.subscriptionHourlyLimit };
beforeEach(() => {
  env.paymentsEnabled = true;
  env.subscriptionHourlyLimit = 25;
  generateImpl = async () => ({ playlist: PLAYLIST });
});
afterEach(() => {
  env.paymentsEnabled = saved.paymentsEnabled;
  env.subscriptionHourlyLimit = saved.limit;
});

describe("credit spend per successful generation", () => {
  test("success spends exactly one credit", async () => {
    const db = freshDb();
    addCredits(db, CHAT, 2);
    const outcome = await startGeneration(db, CHAT, PROMPT);
    expect(outcome.status).toBe("ok");
    expect(getUser(db, CHAT)?.credits).toBe(1);
  });

  test("clarify round is free", async () => {
    const db = freshDb();
    addCredits(db, CHAT, 2);
    generateImpl = async () => {
      throw new ClarifyNeededError("Какое настроение?", ["весёлое", "грустное"], [], 1);
    };
    const outcome = await startGeneration(db, CHAT, PROMPT);
    expect(outcome.status).toBe("clarify");
    expect(getUser(db, CHAT)?.credits).toBe(2);
  });

  test("failed generation is free", async () => {
    const db = freshDb();
    addCredits(db, CHAT, 2);
    generateImpl = async () => {
      throw new NoTracksResolvedError();
    };
    const outcome = await startGeneration(db, CHAT, PROMPT);
    expect(outcome.status).toBe("error");
    expect(getUser(db, CHAT)?.credits).toBe(2);
  });

  test("resume spends one credit; first 3 extends free, 4th charges", async () => {
    const db = freshDb();
    addCredits(db, CHAT, 3);

    const first = await startGeneration(db, CHAT, PROMPT);
    expect(first.status).toBe("ok");
    expect(getUser(db, CHAT)?.credits).toBe(2);

    const resumed = await resumeGeneration(db, CHAT, PROMPT, [], "грустное", 1);
    expect(resumed.status).toBe("ok");
    expect(getUser(db, CHAT)?.credits).toBe(1);

    const genId = first.status === "ok" ? first.generationId : 0;
    for (let i = 0; i < 3; i++) {
      const extended = await extendGeneration(db, CHAT, genId, "добавь ещё");
      expect(extended.status).toBe("ok");
      expect(getUser(db, CHAT)?.credits).toBe(1); // free extend — not charged
    }
    const fourth = await extendGeneration(db, CHAT, genId, "добавь ещё");
    expect(fourth.status).toBe("ok");
    expect(getUser(db, CHAT)?.credits).toBe(0); // 4th extend costs a credit
  });

  test("free extend works with zero balance; 4th needs purchase", async () => {
    const db = freshDb();
    addCredits(db, CHAT, 1);
    const first = await startGeneration(db, CHAT, PROMPT);
    const genId = first.status === "ok" ? first.generationId : 0;
    expect(getUser(db, CHAT)?.credits).toBe(0);

    for (let i = 0; i < 3; i++) {
      expect((await extendGeneration(db, CHAT, genId, "ещё")).status).toBe("ok");
    }
    expect((await extendGeneration(db, CHAT, genId, "ещё")).status).toBe("needs_purchase");
  });

  test("zero balance → needs_purchase on every path, no LLM call", async () => {
    const db = freshDb();
    let called = 0;
    generateImpl = async () => {
      called++;
      return { playlist: PLAYLIST };
    };
    expect((await startGeneration(db, CHAT, PROMPT)).status).toBe("needs_purchase");
    expect((await resumeGeneration(db, CHAT, PROMPT, [], "x", 1)).status).toBe("needs_purchase");
    // extend past the free allowance is paywalled too
    const genId = insertGeneration(db, CHAT, "p", "pl", 1, []);
    db.query(`UPDATE generations SET extend_count = 3 WHERE id = ?`).run(genId);
    expect((await extendGeneration(db, CHAT, genId, "x")).status).toBe("needs_purchase");
    expect(called).toBe(0);
  });
});

describe("multi-round clarify", () => {
  test("first agent-triggered clarify returns round 1", async () => {
    const db = freshDb();
    addCredits(db, CHAT, 2);
    generateImpl = async () => {
      throw new ClarifyNeededError("Какое настроение?", ["весёлое", "грустное", "спокойное"], [], 1);
    };
    const outcome = await startGeneration(db, CHAT, PROMPT);
    expect(outcome.status).toBe("clarify");
    if (outcome.status === "clarify") expect(outcome.round).toBe(1);
  });

  test("second agent-triggered clarify after a first round returns round 2", async () => {
    const db = freshDb();
    addCredits(db, CHAT, 2);
    generateImpl = async () => {
      throw new ClarifyNeededError("Уточните жанр?", ["рок", "поп", "джаз"], [], 2);
    };
    const resumed = await resumeGeneration(db, CHAT, PROMPT, [], "любой", 1);
    expect(resumed.status).toBe("clarify");
    if (resumed.status === "clarify") expect(resumed.round).toBe(2);
  });

  test("resuming past round 3 still completes (agent forced to finalize)", async () => {
    const db = freshDb();
    addCredits(db, CHAT, 2);
    generateImpl = async () => ({ playlist: PLAYLIST });
    const resumed = await resumeGeneration(db, CHAT, PROMPT, [], "любой", 3);
    expect(resumed.status).toBe("ok");
  });
});

describe("subscription access", () => {
  test("subscriber generates without spending credits", async () => {
    const db = freshDb();
    extendSubscription(db, CHAT, 30);
    addCredits(db, CHAT, 3);
    // credits > 0 → consumeAccess is subscription-aware: not charged
    const outcome = await startGeneration(db, CHAT, PROMPT);
    expect(outcome.status).toBe("ok");
    expect(getUser(db, CHAT)?.credits).toBe(3);
  });

  test("expired subscription falls back to credits", async () => {
    const db = freshDb();
    addCredits(db, CHAT, 2);
    const past = Math.floor(Date.now() / 1000) - 60;
    db.query(`UPDATE users SET subscription_until = ? WHERE chat_id = ?`).run(past, CHAT);
    const outcome = await startGeneration(db, CHAT, PROMPT);
    expect(outcome.status).toBe("ok");
    expect(getUser(db, CHAT)?.credits).toBe(1);
  });

  test("expired subscription with no credits → needs_purchase", async () => {
    const db = freshDb();
    const past = Math.floor(Date.now() / 1000) - 60;
    db.query(`UPDATE users SET subscription_until = ? WHERE chat_id = ?`).run(past, CHAT);
    expect((await startGeneration(db, CHAT, PROMPT)).status).toBe("needs_purchase");
  });
});

describe("subscription hourly rate limit", () => {
  function subscribeOnly(db: ReturnType<typeof freshDb>) {
    extendSubscription(db, CHAT, 30);
    db.query(`UPDATE users SET credits = 0, trial_credits = 0 WHERE chat_id = ?`).run(CHAT);
  }

  function seedGenerations(db: ReturnType<typeof freshDb>, n: number) {
    for (let i = 0; i < n; i++) insertGeneration(db, CHAT, "p", "pl", 1, []);
  }

  test("under the limit generates normally", async () => {
    const db = freshDb();
    subscribeOnly(db);
    env.subscriptionHourlyLimit = 3;
    seedGenerations(db, 2);
    const outcome = await startGeneration(db, CHAT, PROMPT);
    expect(outcome.status).toBe("ok");
  });

  test("at the limit → rate_limited before any LLM call, with retryAt", async () => {
    const db = freshDb();
    subscribeOnly(db);
    env.subscriptionHourlyLimit = 3;
    seedGenerations(db, 3);
    backdateGenerations(db, 600); // oldest is 10 min old

    let called = 0;
    generateImpl = async () => {
      called++;
      return { playlist: PLAYLIST };
    };
    const outcome = await startGeneration(db, CHAT, PROMPT);
    expect(outcome.status).toBe("rate_limited");
    if (outcome.status === "rate_limited") {
      const now = Math.floor(Date.now() / 1000);
      // slot frees when the 10-minutes-old generation turns an hour old
      expect(outcome.retryAt).toBeGreaterThan(now + 2900);
      expect(outcome.retryAt).toBeLessThanOrEqual(now + 3000);
    }
    expect(called).toBe(0);

    // resume and paid extend are gated identically
    expect((await resumeGeneration(db, CHAT, PROMPT, [], "x", 1)).status).toBe("rate_limited");
    db.query(`UPDATE generations SET extend_count = 3 WHERE id = 1`).run();
    expect((await extendGeneration(db, CHAT, 1, "x")).status).toBe("rate_limited");
    expect(called).toBe(0);
  });

  test("window slides: generations older than an hour do not count", async () => {
    const db = freshDb();
    subscribeOnly(db);
    env.subscriptionHourlyLimit = 3;
    seedGenerations(db, 3);
    backdateGenerations(db, 3700);
    expect((await startGeneration(db, CHAT, PROMPT)).status).toBe("ok");
  });

  test("limit 0 disables the check", async () => {
    const db = freshDb();
    subscribeOnly(db);
    env.subscriptionHourlyLimit = 0;
    seedGenerations(db, 50);
    expect((await startGeneration(db, CHAT, PROMPT)).status).toBe("ok");
  });

  test("credit user is never rate-limited", async () => {
    const db = freshDb();
    addCredits(db, CHAT, 10);
    env.subscriptionHourlyLimit = 3;
    seedGenerations(db, 5);
    const outcome = await startGeneration(db, CHAT, PROMPT);
    expect(outcome.status).toBe("ok");
    // and the credit was spent, as usual
    expect(getUser(db, CHAT)?.credits).toBe(9);
  });

  test("admin is never rate-limited", async () => {
    const db = freshDb();
    db.query(`INSERT INTO allowlist (chat_id, is_admin) VALUES (?, 1)`).run(CHAT);
    extendSubscription(db, CHAT, 30);
    db.query(`UPDATE users SET credits = 0, trial_credits = 0 WHERE chat_id = ?`).run(CHAT);
    env.subscriptionHourlyLimit = 1;
    seedGenerations(db, 5);
    expect(checkSubscriptionRateLimit(db, CHAT).limited).toBe(false);
    expect((await startGeneration(db, CHAT, PROMPT)).status).toBe("ok");
  });

  test("paymentsEnabled=false disables the limit", async () => {
    const db = freshDb();
    subscribeOnly(db);
    env.subscriptionHourlyLimit = 1;
    seedGenerations(db, 5);
    env.paymentsEnabled = false;
    expect((await startGeneration(db, CHAT, PROMPT)).status).toBe("ok");
  });
});
