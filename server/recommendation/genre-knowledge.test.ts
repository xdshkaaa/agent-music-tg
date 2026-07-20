import { describe, expect, test } from "bun:test";
import {
  MAX_GENRE_HINT_CHARS,
  appendGenreHint,
  formatGenreHint,
  normalizeMusicText,
  resolveGenreContext,
} from "./genre-knowledge";

describe("genre knowledge retrieval", () => {
  test("maps Russian, English, and transliterated aliases to the same genre", () => {
    expect(resolveGenreContext("хочу атмосферный шугейз")?.genreIds).toContain("shoegaze");
    expect(resolveGenreContext("dreamy shoegaze")?.genreIds).toContain("shoegaze");
    expect(resolveGenreContext("spokojny shugeyz")?.genreIds).toContain("shoegaze");
  });

  test("handles Cyrillic punctuation and yo normalization", () => {
    expect(normalizeMusicText("ТЁМНАЯ, электронная музыка!")).toBe("темная электронная музыка");
    const context = resolveGenreContext("ТЁМНАЯ, электронная музыка!");
    expect(context?.genreIds).toContain("electronic");
    expect(context?.moods).toContain("dark");
  });

  test("returns mood-only guidance for a useful mood request", () => {
    const context = resolveGenreContext("нужна спокойная музыка для учебы");
    expect(context?.genreIds).toEqual([]);
    expect(context?.moods).toContain("calm");
    expect(context?.queryTerms).toContain("focus music");
  });

  test("returns null for an unknown request and preserves the prompt", () => {
    expect(resolveGenreContext("что-нибудь такое эдакое")).toBeNull();
    expect(appendGenreHint("base prompt", null)).toBe("base prompt");
  });

  test("prefers a specific multi-word genre over its broad parent", () => {
    const context = resolveGenreContext("современный альтернативный рок");
    expect(context?.genreIds[0]).toBe("alternative-rock");
  });

  test("keeps the prompt hint within the fixed character budget", () => {
    const context = resolveGenreContext("грустный дрим поп и шугейз")!;
    const hint = formatGenreHint(context);
    expect(hint.length).toBeLessThanOrEqual(MAX_GENRE_HINT_CHARS);
    expect(appendGenreHint("base", context)).toContain("LOCAL MUSIC CONTEXT");
  });

  test("retrieval remains a cheap synchronous operation", () => {
    const started = performance.now();
    for (let i = 0; i < 10_000; i++) resolveGenreContext("темный постпанк для ночной поездки");
    const elapsed = performance.now() - started;
    // Wide enough for loaded CI while still catching accidental I/O or an
    // unexpectedly superlinear implementation.
    expect(elapsed).toBeLessThan(1_000);
  });
});
