import { describe, expect, test, afterEach } from "bun:test";
import { shareUrlToChat, parseShareToken } from "./share";

const originalWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("shareUrlToChat", () => {
  test("opens the Telegram share sheet with the link and text", () => {
    const opened: string[] = [];
    (globalThis as { window: unknown }).window = {
      Telegram: { WebApp: { openTelegramLink: (u: string) => opened.push(u) } },
    };

    shareUrlToChat("https://t.me/bot?start=pl_abc123XYZ0", "Вечерний драйв");

    expect(opened).toHaveLength(1);
    expect(opened[0]).toContain("https://t.me/share/url?url=");
    expect(opened[0]).toContain(encodeURIComponent("https://t.me/bot?start=pl_abc123XYZ0"));
    expect(opened[0]).toContain(encodeURIComponent("Вечерний драйв"));
  });

  test("falls back to a new tab outside Telegram", () => {
    const opened: string[] = [];
    (globalThis as { window: unknown }).window = { open: (u: string) => opened.push(u) };

    shareUrlToChat("https://t.me/bot?start=pl_abc123XYZ0", "Вечерний драйв");

    expect(opened).toHaveLength(1);
    expect(opened[0]).toContain("https://t.me/share/url?url=");
  });
});

describe("parseShareToken", () => {
  test("accepts the bare ?share= form and the pl_ start_param form", () => {
    expect(parseShareToken("abc123XYZ0")).toBe("abc123XYZ0");
    expect(parseShareToken("pl_abc123XYZ0")).toBe("abc123XYZ0");
  });

  test("rejects other start payloads and malformed tokens", () => {
    expect(parseShareToken("ref_12345")).toBeNull();
    expect(parseShareToken("utm_vk__cpc__x")).toBeNull();
    expect(parseShareToken("tooshort")).toBeNull();
    expect(parseShareToken(null)).toBeNull();
    expect(parseShareToken("")).toBeNull();
  });
});
