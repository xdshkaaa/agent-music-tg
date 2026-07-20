import { describe, expect, test } from "bun:test";
import { completeOnboarding, ONBOARDING_STORAGE_KEY, shouldShowOnboarding } from "./onboarding";

describe("onboarding persistence", () => {
  test("shows until the first-run flow is completed", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(shouldShowOnboarding(storage)).toBe(true);
    completeOnboarding(storage);
    expect(values.get(ONBOARDING_STORAGE_KEY)).toBe("done");
    expect(shouldShowOnboarding(storage)).toBe(false);
  });

  test("fails open when storage is unavailable", () => {
    expect(shouldShowOnboarding({ getItem: () => { throw new Error("blocked"); } })).toBe(true);
    expect(() => completeOnboarding({ setItem: () => { throw new Error("blocked"); } })).not.toThrow();
  });
});
