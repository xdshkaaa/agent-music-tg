const THUMBNAIL_FETCH_TIMEOUT_MS = 5_000;

/**
 * Fetches a track's artwork as raw bytes. Never throws — a slow or dead
 * artwork URL must not block the audio itself from sending, so callers get
 * `undefined` and skip the thumbnail.
 *
 * Deliberately independent of grammY's `InputFile`: deliver.ts (which has no
 * grammY dependency) starts this fetch alongside extraction, well before
 * telegram-sender.ts wraps the resolved bytes into an `InputFile` for
 * `sendAudio` — so the two no longer run one after the other.
 */
export async function fetchThumbnailBytes(url: string | undefined): Promise<Uint8Array | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(THUMBNAIL_FETCH_TIMEOUT_MS) });
    if (!res.ok) return undefined;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return undefined;
  }
}
