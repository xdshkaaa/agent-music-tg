import { describe, expect, test } from "bun:test";
import { normalizeSupportContact } from "./telegram";

describe("support contact navigation", () => {
  test("recognizes Telegram contacts so Mini Apps can open them directly", () => {
    expect(normalizeSupportContact("https://t.me/litteralIy")).toEqual({
      url: "https://t.me/litteralIy",
      telegram: true,
    });
    expect(normalizeSupportContact("@litteralIy")).toEqual({
      url: "https://t.me/litteralIy",
      telegram: true,
    });
  });

  test("keeps external support URLs on the regular link path", () => {
    expect(normalizeSupportContact("https://support.example.com/help")).toEqual({
      url: "https://support.example.com/help",
      telegram: false,
    });
  });
});
