import { describe, expect, test } from "bun:test";
import { buildTelegramUtmLink, buildTelegramUtmPayload, normalizeUtmSlug } from "./utm";

describe("Telegram UTM links", () => {
  test("normalizes fields into a Telegram-safe payload", () => {
    expect(normalizeUtmSlug(" Summer Sale 2026 ")).toBe("summer-sale-2026");
    expect(buildTelegramUtmPayload({
      source: "VK Ads",
      medium: "CPC",
      campaign: "Summer Sale 2026",
      content: "Banner A",
    })).toBe("utm_vk-ads__cpc__summer-sale-2026__banner-a");
  });

  test("builds a bot deep link and rejects incomplete or oversized marks", () => {
    expect(buildTelegramUtmLink("https://t.me/example_bot?start=old", {
      source: "telegram",
      medium: "post",
      campaign: "launch",
    })).toBe("https://t.me/example_bot?start=utm_telegram__post__launch");
    expect(buildTelegramUtmPayload({ source: "", medium: "cpc", campaign: "launch" })).toBeNull();
    expect(buildTelegramUtmPayload({ source: "vk", medium: "cpc", campaign: "x".repeat(80) })).toBeNull();
  });
});
