import { describe, expect, test } from "bun:test";
import { ARTWORK_FULL, ARTWORK_ROW, artworkUrl } from "./artwork";

const YT = "https://yt3.googleusercontent.com/BAl1FqoDaFrpWSSrr95Yjii4fJSe=w544-h544-l90-rj";

describe("artworkUrl", () => {
  test("resizes YouTube Music thumbnails without dropping the trailing flags", () => {
    // The -l90-rj suffix carries quality/crop; a naive replace of everything
    // after `=` returns a URL that 404s.
    expect(artworkUrl(YT, ARTWORK_ROW)).toBe(
      "https://yt3.googleusercontent.com/BAl1FqoDaFrpWSSrr95Yjii4fJSe=w120-h120-l90-rj",
    );
    expect(artworkUrl(YT, ARTWORK_FULL)).toBe(YT);
  });

  test("resizes ggpht-hosted artist avatars too", () => {
    expect(artworkUrl("https://yt3.ggpht.com/abc=w60-h60-c-k-no", 120)).toBe(
      "https://yt3.ggpht.com/abc=w120-h120-c-k-no",
    );
  });

  test("maps SoundCloud -large.jpg to the variant matching the slot", () => {
    const sc = "https://i1.sndcdn.com/artworks-000353437275-04oacs-large.jpg";
    expect(artworkUrl(sc, ARTWORK_ROW)).toBe(
      "https://i1.sndcdn.com/artworks-000353437275-04oacs-t120x120.jpg",
    );
    expect(artworkUrl(sc, ARTWORK_FULL)).toBe(
      "https://i1.sndcdn.com/artworks-000353437275-04oacs-t500x500.jpg",
    );
  });

  test("passes through unknown hosts and URLs with no size directive", () => {
    expect(artworkUrl("https://example.com/cover.jpg", 120)).toBe("https://example.com/cover.jpg");
    expect(artworkUrl("https://yt3.googleusercontent.com/abc", 120)).toBe(
      "https://yt3.googleusercontent.com/abc",
    );
  });

  test("returns undefined for a missing URL so callers can render their fallback", () => {
    expect(artworkUrl(undefined, 120)).toBeUndefined();
    expect(artworkUrl(null, 120)).toBeUndefined();
    expect(artworkUrl("", 120)).toBeUndefined();
  });
});
