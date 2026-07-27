import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ACCENT_PRESETS, applyAccent, DEFAULT_ACCENT, initialAccent } from "./accent";

const KEY = "miniapp-accent";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const g = globalThis as { localStorage?: unknown; document?: unknown };

afterEach(() => {
  delete g.localStorage;
  delete g.document;
});

beforeEach(() => {
  g.document = { documentElement: { style: { setProperty: () => {} } } };
});

describe("initialAccent", () => {
  test("restores a previously chosen preset", () => {
    const violet = ACCENT_PRESETS.find((p) => p.id === "violet")!.value;
    g.localStorage = fakeStorage({ [KEY]: violet });
    expect(initialAccent()).toBe(violet);
  });

  test("ignores a stored value that is no longer a known preset", () => {
    g.localStorage = fakeStorage({ [KEY]: "#123456" });
    expect(initialAccent()).toBe(DEFAULT_ACCENT);
  });

  test("falls back to the default with nothing stored", () => {
    g.localStorage = fakeStorage();
    expect(initialAccent()).toBe(DEFAULT_ACCENT);
  });

  test("falls back to the default when storage is unavailable", () => {
    expect(initialAccent()).toBe(DEFAULT_ACCENT);
  });
});

describe("applyAccent", () => {
  test("sets the --accent custom property and persists the choice", () => {
    const set: [string, string][] = [];
    g.document = { documentElement: { style: { setProperty: (k: string, v: string) => set.push([k, v]) } } };
    const storage = fakeStorage();
    g.localStorage = storage;

    applyAccent("#8b5cf6");

    expect(set).toEqual([["--accent", "#8b5cf6"]]);
    expect(storage.getItem(KEY)).toBe("#8b5cf6");
    expect(initialAccent()).toBe("#8b5cf6");
  });

  test("still applies the colour when storage throws (private mode)", () => {
    const set: [string, string][] = [];
    g.document = { documentElement: { style: { setProperty: (k: string, v: string) => set.push([k, v]) } } };
    g.localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };

    expect(() => applyAccent("#22c55e")).not.toThrow();
    expect(set).toEqual([["--accent", "#22c55e"]]);
  });
});

describe("ACCENT_PRESETS", () => {
  test("has unique ids and values, defaulting to the first preset", () => {
    expect(new Set(ACCENT_PRESETS.map((p) => p.id)).size).toBe(ACCENT_PRESETS.length);
    expect(new Set(ACCENT_PRESETS.map((p) => p.value)).size).toBe(ACCENT_PRESETS.length);
    expect(DEFAULT_ACCENT).toBe(ACCENT_PRESETS[0].value);
  });

  test("every preset is a hex colour with a Russian label", () => {
    for (const preset of ACCENT_PRESETS) {
      expect(preset.value).toMatch(/^#[0-9a-f]{6}$/);
      expect(preset.label).toMatch(/[А-Яа-яЁё]/);
    }
  });
});
