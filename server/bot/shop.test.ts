import { describe, expect, test, beforeEach } from "bun:test";

// env.ts throws without a bot token at import time; set one before the
// dynamic imports below pull it in.
process.env.TELEGRAM_BOT_TOKEN ??= "test-token";

const { env } = await import("../env");
const { openDb } = await import("../db");
const { createOffer } = await import("../payments/offers-store");
const { claimTrial } = await import("../access/users-store");
const { offersKeyboard, purchasePromptText } = await import("./shop");
const { __resetForTests } = await import("./emoji");

// Emoji sticker set is unset in tests → accent() returns "" and heading()
// returns the bare text, so purchasePromptText() yields a clean ДОСТУП header.
beforeEach(() => {
  __resetForTests();
});

function freshDb() {
  return openDb(":memory:");
}

const CHAT = 222;

function rowData(kb: NonNullable<ReturnType<typeof offersKeyboard>>): string[] {
  // `.row()` after each button leaves a trailing empty row (grammy convention);
  // filter to the non-empty rows that carry the actual callback buttons.
  return kb.inline_keyboard
    .filter((r) => r.length > 0)
    .map((row) => {
      const btn = row[0];
      return btn && "callback_data" in btn ? (btn.callback_data as string) : "";
    });
}

describe("shop offersKeyboard", () => {
  test("unclaimed trial button leads, then buy:<id> rows", () => {
    const db = freshDb();
    createOffer(db, { title: "10 gens", amount: "5", asset: "USDT", starsAmount: 100, grantKind: "credits", grantAmount: 10 });
    createOffer(db, { title: "month", amount: "9", asset: "TON", starsAmount: 100, grantKind: "subscription", grantAmount: 30 });

    const kb = offersKeyboard(db, CHAT);
    expect(kb).not.toBeNull();
    const data = rowData(kb!);
    expect(data.length).toBe(3);
    expect(data[0]).toBe("trial:claim");
    expect(data[1]).toMatch(/^buy:\d+$/);
    expect(data[2]).toMatch(/^buy:\d+$/);
  });

  test("claimed trial hides the trial button", () => {
    const db = freshDb();
    createOffer(db, { title: "10 gens", amount: "5", asset: "USDT", starsAmount: 100, grantKind: "credits", grantAmount: 10 });
    claimTrial(db, CHAT);

    const data = rowData(offersKeyboard(db, CHAT)!);
    expect(data.length).toBe(1);
    expect(data[0]).toMatch(/^buy:\d+$/);
  });

  test("no offers but unclaimed trial → keyboard with only the trial button", () => {
    const db = freshDb();
    const data = rowData(offersKeyboard(db, CHAT)!);
    expect(data).toEqual(["trial:claim"]);
  });

  test("returns null when no active offers and trial already claimed", () => {
    const db = freshDb();
    claimTrial(db, CHAT);
    expect(offersKeyboard(db, CHAT)).toBeNull();
  });

  test("trial button still shown when payments disabled (guard is in handler)", () => {
    const db = freshDb();
    // The guard is in the callback handler, not in the keyboard builder.
    // Keyboard should still show the trial button even when payments are off.
    env.paymentsEnabled = false;
    const data = rowData(offersKeyboard(db, CHAT)!);
    expect(data).toEqual(["trial:claim"]);
    // Reset to avoid side effects
    env.paymentsEnabled = true;
  });
});

describe("shop purchasePromptText", () => {
  test("starts with the ДОСТУП header (clean text when emoji unset)", () => {
    const text = purchasePromptText();
    expect(text.startsWith("<b>ДОСТУП</b>")).toBe(true);
    expect(text).toContain("Выберите пакет");
  });
});
