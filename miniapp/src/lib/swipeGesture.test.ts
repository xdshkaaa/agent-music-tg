import { describe, expect, test } from "bun:test";
import { shouldEngageVerticalSwipe } from "./swipeGesture";

describe("shouldEngageVerticalSwipe", () => {
  test("ignores jitter below the slop", () => {
    expect(shouldEngageVerticalSwipe(0, 5)).toBe(false);
    expect(shouldEngageVerticalSwipe(3, -4)).toBe(false);
  });

  test("engages on a clear vertical drag past the slop", () => {
    expect(shouldEngageVerticalSwipe(0, 40)).toBe(true);
    expect(shouldEngageVerticalSwipe(2, -40)).toBe(true);
  });

  test("rejects a mostly-horizontal drag even past the slop", () => {
    expect(shouldEngageVerticalSwipe(40, 5)).toBe(false);
    expect(shouldEngageVerticalSwipe(-60, 10)).toBe(false);
  });

  test("rejects an exact diagonal (neither axis dominant)", () => {
    expect(shouldEngageVerticalSwipe(30, 30)).toBe(false);
  });

  test("respects a custom slop", () => {
    expect(shouldEngageVerticalSwipe(0, 15, 20)).toBe(false);
    expect(shouldEngageVerticalSwipe(0, 25, 20)).toBe(true);
  });
});
