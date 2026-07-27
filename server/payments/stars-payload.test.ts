import { describe, expect, test } from "bun:test";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

const { classifyStarsPayload, parseStarsPayload } = await import("./stars");

describe("classifyStarsPayload", () => {
  test("recognises an offer invoice payload", () => {
    const raw = JSON.stringify({ chatId: 42, offerId: 7 });
    expect(classifyStarsPayload(raw)).toEqual({ kind: "offer", chatId: 42, offerId: 7 });
  });

  // The regression this guards: the slots payload is not JSON, so the offer
  // handler used to classify it as invalid and reject the checkout outright.
  test("recognises a playlist-slots payload the offer parser cannot read", () => {
    const raw = "slots:-100500:3:9f1c2d3e-0000-4444-8888-aaaabbbbcccc";
    expect(parseStarsPayload(raw)).toBeNull();
    expect(classifyStarsPayload(raw)).toEqual({ kind: "slots", chatId: -100500, slots: 3 });
  });

  test("rejects a slots payload with a non-positive count", () => {
    expect(classifyStarsPayload("slots:1:0:uuid").kind).toBe("unknown");
  });

  test("treats anything else as unknown", () => {
    for (const raw of ["", "garbage", "slots:", "slots:abc:2:uuid", JSON.stringify({ chatId: 1 })]) {
      expect(classifyStarsPayload(raw).kind).toBe("unknown");
    }
  });
});
