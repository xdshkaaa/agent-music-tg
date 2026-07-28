/**
 * Both backends hand us one artwork URL per item, and both pick the *largest*
 * variant they have (`thumbnails.at(-1)` on YouTube Music, `-large.jpg` on
 * SoundCloud). A YouTube cover at w544 is ~196 KB; the same image at w120 is
 * ~15 KB. A single search paints ~37 rows at 44px, so serving them the 544px
 * file costs several MB and the rows sit on their empty grey background long
 * enough to read as "no covers at all".
 *
 * Both hosts encode the size in the URL, so the right variant is a rewrite
 * rather than a second request: ask for what the slot actually renders.
 */
export function artworkUrl(url: string | null | undefined, size: number): string | undefined {
  if (!url) return undefined;
  // googleusercontent/ggpht: `=w544-h544-l90-rj` — only the size directive is
  // replaced, the trailing flags (crop/quality) have to survive.
  if (/(?:googleusercontent|ggpht)\.com/.test(url)) {
    return url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`);
  }
  // SoundCloud serves `-large.jpg` at 100x100 with fixed-size variants beside it.
  return url.replace(/-large\.(jpg|png)$/, size >= 320 ? "-t500x500.$1" : "-t120x120.$1");
}

/** Size for the 44px list rows (and the 40px player-bar thumbnail) at 2x-3x DPR. */
export const ARTWORK_ROW = 120;

/** Size for the fullscreen player's artwork slot. */
export const ARTWORK_FULL = 544;
