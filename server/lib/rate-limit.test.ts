import { describe, expect, test } from "bun:test";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  function fixedClock(start = 1_000_000) {
    let now = start;
    return { now: () => now, advance: (ms: number) => (now += ms) };
  }

  test("allows exactly `limit` hits inside the window", () => {
    const clock = fixedClock();
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: clock.now });
    expect([limiter.check(1), limiter.check(1), limiter.check(1)]).toEqual([false, false, false]);
    expect(limiter.check(1)).toBe(true);
  });

  test("frees budget as hits age out of the window", () => {
    const clock = fixedClock();
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: clock.now });
    limiter.check(1);
    limiter.check(1);
    expect(limiter.check(1)).toBe(true);
    clock.advance(60_001);
    expect(limiter.check(1)).toBe(false);
  });

  test("budgets are per chat", () => {
    const clock = fixedClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock.now });
    expect(limiter.check(1)).toBe(false);
    expect(limiter.check(1)).toBe(true);
    expect(limiter.check(2)).toBe(false);
  });

  test("a blocked caller does not extend their own window", () => {
    const clock = fixedClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, now: clock.now });
    expect(limiter.check(1)).toBe(false);
    clock.advance(500);
    expect(limiter.check(1)).toBe(true);
    // The rejected attempt must not have been recorded, so the original hit
    // still expires on schedule.
    clock.advance(501);
    expect(limiter.check(1)).toBe(false);
  });

  test("evicts idle chats instead of growing forever", () => {
    const clock = fixedClock();
    const limiter = createRateLimiter({ limit: 5, windowMs: 1_000, maxChats: 3, now: clock.now });
    for (let chat = 0; chat < 50; chat++) limiter.check(chat);
    // Still correct for a fresh caller after heavy churn.
    expect(limiter.check(999)).toBe(false);
  });

  test("reset clears all state", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check(1)).toBe(false);
    expect(limiter.check(1)).toBe(true);
    limiter.reset();
    expect(limiter.check(1)).toBe(false);
  });
});
