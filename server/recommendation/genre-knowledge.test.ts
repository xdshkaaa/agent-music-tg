import { describe, expect, test } from "bun:test";
import {
  MAX_GENRE_HINT_CHARS,
  appendGenreHint,
  formatGenreHint,
  genreBrowseLabels,
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

  test("browse labels are Russian, capitalized, and resolve back to their genre", () => {
    const labels = genreBrowseLabels();
    expect(labels.length).toBe(35);
    expect(labels.slice(0, 3)).toEqual(["Поп", "Рок", "Инди-рок"]);
    // Prefers the hyphenated Russian spelling where the ontology has one.
    expect(labels).toContain("Хип-хоп");
    expect(labels).not.toContain("Хип хоп");
    for (const label of labels) {
      expect(label[0]).toBe(label[0]!.toLocaleUpperCase("ru-RU"));
      // A chip must be a query the resolver actually understands.
      expect(resolveGenreContext(label)).not.toBeNull();
    }
  });

  test("browse labels honour the requested limit", () => {
    expect(genreBrowseLabels(8)).toHaveLength(8);
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
