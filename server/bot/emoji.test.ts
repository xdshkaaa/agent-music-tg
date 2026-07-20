import { describe, expect, test, beforeEach } from "bun:test";

// env.ts throws without a bot token at import time; set one before the
// dynamic imports below pull it in.
process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

const { btnText, accent, heading, fallbackSymbol, loadCustomEmojis, __resetForTests, __setEmojiForTests } = await import("./emoji");

const USED_SYMBOLS = [
  "info",
  "diamond",
  "music",
  "stats",
  "package",
  "broadcast",
  "gear",
  "check",
  "profile",
  "wallet",
  "plus",
  "ruler",
  "sparkle",
  "gift",
  "cross",
  "warning",
  "prohibited",
  "headphone",
  "crown",
  "key",
  "link",
  "success_on",
  "success_off",
];

beforeEach(() => {
  __resetForTests();
});

describe("emoji fallback (EMOJI_STICKER_SET unset)", () => {
  test("btnText returns clean text with no icon when unmapped", () => {
    expect(btnText("Открыть приложение", "sparkle")).toEqual({ text: "Открыть приложение" });
    expect(btnText("Статистика", "stats")).toEqual({ text: "Статистика" });
  });

  test("accent returns empty string when unmapped (no bare unicode in message text)", () => {
    expect(accent("info")).toBe("");
    expect(accent("music")).toBe("");
  });

  test("heading returns the bare text when unmapped", () => {
    expect(heading("info", "AGENT MUSIC")).toBe("AGENT MUSIC");
  });

  test("every used symbol has a non-empty unicode fallback and never throws", () => {
    for (const s of USED_SYMBOLS) {
      const v = fallbackSymbol(s);
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });
});

describe("emoji mapped (EMOJI_STICKER_SET resolved a symbol)", () => {
  test("loads the gift icon used by the /start referral button", async () => {
    const bot = {
      api: {
        getCustomEmojiStickers: async (ids: string[]) => ids.map((id) => ({ custom_emoji_id: id })),
      },
    } as unknown as Parameters<typeof loadCustomEmojis>[0];

    await loadCustomEmojis(bot);

    expect(btnText("Пригласить друга", "gift")).toEqual({
      text: "Пригласить друга",
      icon_custom_emoji_id: "6032644646587338669",
    });
  });

  test("btnText returns { text, icon_custom_emoji_id } when mapped", () => {
    __setEmojiForTests("sparkle", "5377637156164392590");
    expect(btnText("Открыть приложение", "sparkle")).toEqual({
      text: "Открыть приложение",
      icon_custom_emoji_id: "5377637156164392590",
    });
  });

  test("accent returns a <tg-emoji emoji-id=\"ID\">…</tg-emoji> HTML tag when mapped", () => {
    __setEmojiForTests("info", "5377637156164392589");
    const out = accent("info");
    expect(out).toBe('<tg-emoji emoji-id="5377637156164392589">ℹ️</tg-emoji>');
  });

  test("heading prefixes the text with the tg-emoji tag when mapped", () => {
    __setEmojiForTests("info", "5377637156164392589");
    expect(heading("info", "AGENT MUSIC")).toBe(
      '<tg-emoji emoji-id="5377637156164392589">ℹ️</tg-emoji> AGENT MUSIC',
    );
  });

  test("unmapped symbol falls back to clean text even when other symbols are mapped", () => {
    __setEmojiForTests("info", "123");
    expect(btnText("Магазин", "music")).toEqual({ text: "Магазин" });
    expect(accent("music")).toBe("");
  });
});
