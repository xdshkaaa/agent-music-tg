import { describe, expect, test, beforeEach } from "bun:test";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

const { __resetForTests, __setEmojiForTests } = await import("./emoji");
const { detailBlock, detailRow, escapeHtml, messageHint, messageTitle, statusMessage } = await import("./message-format");

beforeEach(() => {
  __resetForTests();
});

describe("bot message formatting", () => {
  test("escapes dynamic Telegram HTML values", () => {
    expect(escapeHtml('A & B <C> "D"')).toBe("A &amp; B &lt;C&gt; &quot;D&quot;");
  });

  test("builds a clean title when no custom emoji is loaded", () => {
    expect(messageTitle("info", "Помощь & FAQ")).toBe("<b>Помощь &amp; FAQ</b>");
  });

  test("keeps premium emoji inside the bold title", () => {
    __setEmojiForTests("info", "123");
    expect(messageTitle("info", "Помощь")).toBe(
      '<b><tg-emoji emoji-id="123">ℹ️</tg-emoji> Помощь</b>',
    );
  });

  test("formats hints, detail blocks, rows, and statuses", () => {
    expect(messageHint("Выберите <вариант>")).toBe("<i>Выберите &lt;вариант&gt;</i>");
    expect(detailBlock(["one", "two"])).toBe("<blockquote>one\ntwo</blockquote>");
    expect(detailRow("wallet", "Баланс:", "5 & more")).toBe("<b>Баланс:</b>  5 &amp; more");
    expect(statusMessage("check", "Готово", "Пакет A & B активирован")).toBe(
      "<b>Готово</b>\nПакет A &amp; B активирован",
    );
  });
});
