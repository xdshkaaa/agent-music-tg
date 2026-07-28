import { describe, expect, test } from "bun:test";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

const { buildShareUrl, parseShareToken } = await import("./share-link");

describe("share-link", () => {
  test("builds a bot deep link when no mini app name is configured", () => {
    expect(buildShareUrl("music_agentbot", "abc123XYZ0")).toBe(
      "https://t.me/music_agentbot?start=pl_abc123XYZ0",
    );
  });

  test("parses its own start payload", () => {
    expect(parseShareToken("pl_abc123XYZ0")).toBe("abc123XYZ0");
  });

  test("ignores unrelated start payloads", () => {
    expect(parseShareToken("ref_12345")).toBeNull();
    expect(parseShareToken("utm_vk__cpc__x")).toBeNull();
    expect(parseShareToken(null)).toBeNull();
    expect(parseShareToken("pl_not!valid")).toBeNull();
  });
});
