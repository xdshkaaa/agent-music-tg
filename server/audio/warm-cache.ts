import type { AppDb } from "../db";
import { deliverTrack, type DeliverDeps } from "./deliver";
import type { DownloadTrack } from "./downloads-store";

/**
 * Pre-warms `audio_cache` for inline search: extracts a track and uploads it
 * to a private storage channel (not to any user) purely to mint a Telegram
 * `file_id`, so the *next* inline query for the same track can answer with a
 * cached-audio result instead of an empty list. `deliverTrack` already does
 * exactly this work — cache check, extract+upload, cache write — the only
 * difference here is the destination chat.
 *
 * Deduped by track uri alone (not uri+chat, unlike group search's dedupe):
 * audio_cache is global, so two unrelated queries for the same track must
 * never race two extractions no matter which chat asked first.
 */
const inFlight = new Map<string, Promise<void>>();

/** Test seam: the module-level dedupe map would otherwise leak between cases. */
export function __resetWarmCacheForTests(): void {
  inFlight.clear();
}

export async function warmTrack(
  db: AppDb,
  track: DownloadTrack,
  deps: DeliverDeps,
  storageChatId: number,
): Promise<void> {
  const existing = inFlight.get(track.uri);
  if (existing) {
    await existing;
    return;
  }
  const run = deliverTrack(db, storageChatId, track, deps).catch((e) => {
    console.error(`[inline warm] failed to warm ${track.uri}:`, e);
  });
  inFlight.set(track.uri, run);
  try {
    await run;
  } finally {
    inFlight.delete(track.uri);
  }
}
