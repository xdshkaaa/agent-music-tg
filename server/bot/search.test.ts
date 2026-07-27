import { describe, expect, test } from "bun:test";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

const { buildSearchView, clampPage, emptySearchView, pageCount, PAGE_SIZE, CALLBACK_DATA_MAX_BYTES } =
  await import("./search");
const { __resetForTests } = await import("./emoji");

import type { InlineKeyboard } from "grammy";
import type { Track } from "../music/types";

__resetForTests();

function tracks(n: number): Track[] {
  return Array.from({ length: n }, (_, i) => ({
    uri: `ytm:track_${i}`,
    title: `Трек ${i}`,
    artist: `Артист ${i}`,
    durationMs: 185_000,
  }));
}

/** Every callback_data grammY will send for this view. */
function callbackData(view: { keyboard: InlineKeyboard }): string[] {
  return view.keyboard.inline_keyboard.flat().flatMap((b) => ("callback_data" in b ? [b.callback_data] : []));
}

describe("pagination arithmetic", () => {
  test("counts pages, never fewer than one", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(1)).toBe(1);
    expect(pageCount(PAGE_SIZE)).toBe(1);
    expect(pageCount(PAGE_SIZE + 1)).toBe(2);
    expect(pageCount(30)).toBe(6);
  });

  test("clamps an out-of-range page instead of returning an empty view", () => {
    expect(clampPage(-5, 30)).toBe(0);
    expect(clampPage(99, 30)).toBe(5);
    expect(clampPage(2, 30)).toBe(2);
  });
});

describe("buildSearchView", () => {
  test("shows one page of results with absolute numbering", () => {
    const view = buildSearchView("инди", tracks(12), 1);
    expect(view.text).toContain("6. <b>Трек 5</b>");
    expect(view.text).toContain("10. <b>Трек 9</b>");
    expect(view.text).not.toContain("11. <b>Трек 10</b>");
    expect(view.text).toContain("Страница 2 из 3");
  });

  test("offers prev and next only where they exist", () => {
    const first = callbackData(buildSearchView("q", tracks(12), 0));
    expect(first).toContain("srch:p:1");
    expect(first).not.toContain("srch:p:-1");

    const last = callbackData(buildSearchView("q", tracks(12), 2));
    expect(last).toContain("srch:p:1");
    expect(last.some((d) => d === "srch:p:3")).toBe(false);
  });

  test("omits pagination entirely for a single page", () => {
    const data = callbackData(buildSearchView("q", tracks(3), 0));
    expect(data.some((d) => d.startsWith("srch:p:"))).toBe(false);
    expect(data).toContain("srch:ai");
  });

  test("addresses tracks by absolute index, not by uri or query", () => {
    const data = callbackData(buildSearchView("q", tracks(12), 1));
    expect(data).toContain("srch:dl:5");
    expect(data).toContain("srch:dl:9");
  });

  // Telegram silently drops buttons whose callback_data exceeds 64 bytes, which
  // is why indexes are used instead of the query or the track uri.
  test("keeps every callback_data within Telegram's 64-byte limit", () => {
    const longQuery = "очень длинный поисковый запрос ".repeat(5);
    const view = buildSearchView(longQuery, tracks(30), 3);
    for (const data of callbackData(view)) {
      expect(Buffer.byteLength(data, "utf8")).toBeLessThanOrEqual(CALLBACK_DATA_MAX_BYTES);
    }
  });

  test("escapes HTML in titles so a crafted track name cannot inject markup", () => {
    const view = buildSearchView("q", [
      { uri: "ytm:x", title: "<b>bold</b>", artist: "a & b" },
    ], 0);
    expect(view.text).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(view.text).toContain("a &amp; b");
  });

  test("escapes HTML in the query echoed back to the user", () => {
    expect(buildSearchView("<script>", tracks(1), 0).text).toContain("&lt;script&gt;");
    expect(emptySearchView("<script>").text).toContain("&lt;script&gt;");
  });
});
