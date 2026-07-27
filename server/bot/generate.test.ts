import { describe, expect, test } from "bun:test";

process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

const { createProgressReporter, outcomeView, progressText } = await import("./generate");
const { __resetForTests } = await import("./emoji");

import type { AgentEvent } from "../agent/types";
import type { GenerationOutcome } from "../core/run-generation";

__resetForTests();

import type { InlineKeyboard } from "grammy";

/** Every callback_data grammY would send for this keyboard. */
function callbackData(keyboard: InlineKeyboard | undefined): string[] {
  if (!keyboard) return [];
  return keyboard.inline_keyboard.flat().flatMap((b) => ("callback_data" in b ? [b.callback_data] : []));
}

const okOutcome: GenerationOutcome = {
  status: "ok",
  generationId: 42,
  playlist: {
    name: "Вечерний инди",
    tracks: [
      { uri: "ytm:a", title: "Alps", artist: "Motorama" },
      { uri: "ytm:b", title: "Above the Clouds", artist: "Motorama" },
    ],
  },
};

describe("outcomeView", () => {
  test("renders a finished playlist with a download action", () => {
    const view = outcomeView(okOutcome);
    expect(view.text).toContain("Вечерний инди");
    expect(view.text).toContain("1. <b>Alps</b>");
    expect(view.text).toContain("2 треков");
    expect(callbackData(view.keyboard)).toContain("gen:dl:42");
  });

  test("turns a clarify round into one button per option", () => {
    const view = outcomeView({
      status: "clarify",
      question: "Какое настроение?",
      options: ["Спокойное", "Бодрое", "Мрачное"],
      messages: [],
      round: 1,
    });
    expect(view.text).toContain("Какое настроение?");
    expect(callbackData(view.keyboard)).toEqual(["gen:cl:0", "gen:cl:1", "gen:cl:2"]);
  });

  test("shows the paywall message without inventing a keyboard", () => {
    const view = outcomeView({ status: "needs_purchase" });
    expect(view.keyboard).toBeUndefined();
    expect(view.text.length).toBeGreaterThan(0);
  });

  test("tells a rate-limited user when they can retry", () => {
    const retryAt = Math.floor(new Date("2026-07-26T15:30:00Z").getTime() / 1000);
    const view = outcomeView({ status: "rate_limited", retryAt });
    expect(view.text).toContain("Лимит по подписке исчерпан");
    expect(view.text).toMatch(/\d{2}:\d{2}/);
  });

  test("surfaces an error message", () => {
    const view = outcomeView({ status: "error", message: "Не удалось подобрать плейлист вовремя." });
    expect(view.text).toContain("Не удалось подобрать плейлист вовремя.");
    expect(view.keyboard).toBeUndefined();
  });

  test("escapes HTML in a playlist name and track titles", () => {
    const view = outcomeView({
      ...okOutcome,
      playlist: { name: "<b>x</b>", tracks: [{ uri: "ytm:a", title: "a & b", artist: "<i>c</i>" }] },
    } as GenerationOutcome);
    expect(view.text).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(view.text).toContain("a &amp; b");
    expect(view.text).toContain("&lt;i&gt;c&lt;/i&gt;");
  });

  test("covers every outcome status", () => {
    const statuses: GenerationOutcome[] = [
      okOutcome,
      { status: "clarify", question: "q", options: ["a"], messages: [], round: 1 },
      { status: "needs_purchase" },
      { status: "rate_limited", retryAt: 1 },
      { status: "error", message: "e" },
    ];
    for (const outcome of statuses) {
      expect(outcomeView(outcome).text.length).toBeGreaterThan(0);
    }
  });
});

describe("createProgressReporter", () => {
  function harness() {
    const sent: string[] = [];
    let now = 0;
    const reporter = createProgressReporter((text) => sent.push(text), {
      intervalMs: 1_000,
      now: () => now,
    });
    return { sent, reporter, advance: (ms: number) => (now += ms) };
  }

  const toolCall: AgentEvent = { kind: "tool_call", id: "1", name: "search", args: { query: "инди" } };

  test("ignores reasoning deltas, which are far too chatty to edit on", () => {
    const { sent, reporter } = harness();
    for (let i = 0; i < 50; i++) reporter.onEvent({ kind: "reasoning", delta: "..." });
    expect(sent).toEqual([]);
  });

  test("coalesces a burst into a single edit", () => {
    const { sent, reporter, advance } = harness();
    advance(5_000); // first event is always allowed through
    for (let i = 0; i < 20; i++) reporter.onEvent(toolCall);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("Ищу: инди");
  });

  test("emits again only after the interval has passed", () => {
    const { sent, reporter, advance } = harness();
    advance(5_000);
    reporter.onEvent(toolCall);
    reporter.onEvent(toolCall);
    expect(sent).toHaveLength(1);
    advance(1_000);
    reporter.onEvent(toolCall);
    expect(sent).toHaveLength(2);
  });

  test("reports the step number so a long run visibly advances", () => {
    const { sent, reporter, advance } = harness();
    advance(5_000);
    reporter.onEvent(toolCall);
    advance(1_000);
    reporter.onEvent(toolCall);
    expect(sent[0]).toContain("шаг 1");
    expect(sent[1]).toContain("шаг 2");
  });

  test("falls back to a generic label when the tool call carries no query", () => {
    const { sent, reporter, advance } = harness();
    advance(5_000);
    reporter.onEvent({ kind: "tool_call", id: "1", name: "x", args: {} });
    expect(sent[0]).toContain("Подбираю треки");
  });

  test("progress text is valid Telegram HTML", () => {
    expect(progressText("Ищу: инди")).toContain("<i>Ищу: инди</i>");
  });
});
