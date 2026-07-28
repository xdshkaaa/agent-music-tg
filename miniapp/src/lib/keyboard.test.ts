import { describe, expect, test } from "bun:test";
import { isKeyboardOpen, keyboardOverlap } from "./keyboard";

describe("keyboardOverlap", () => {
  test("measures the keyboard as the gap between the layout and visual viewports", () => {
    // iPhone 15: 844pt tall, keyboard ~336pt.
    expect(keyboardOverlap(844, { height: 508 })).toBe(336);
  });

  test("is zero with no keyboard, and never negative", () => {
    expect(keyboardOverlap(844, { height: 844 })).toBe(0);
    // Some clients report a visual viewport taller than the layout one.
    expect(keyboardOverlap(844, { height: 900 })).toBe(0);
  });

  test("reports zero where visualViewport is unavailable, leaving the chrome alone", () => {
    expect(keyboardOverlap(844, null)).toBe(0);
    expect(keyboardOverlap(844, undefined)).toBe(0);
  });
});

describe("isKeyboardOpen", () => {
  test("ignores toolbar-sized viewport shuffles", () => {
    // iOS collapses/expands its own bars by a few dozen px; treating that as a
    // keyboard would flicker the dock in and out.
    expect(isKeyboardOpen(0)).toBe(false);
    expect(isKeyboardOpen(60)).toBe(false);
  });

  test("trips on a real keyboard", () => {
    expect(isKeyboardOpen(216)).toBe(true);
    expect(isKeyboardOpen(336)).toBe(true);
  });
});
