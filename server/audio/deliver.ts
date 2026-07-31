import { unlink } from "node:fs/promises";
import type { AppDb } from "../db";
import { getCachedAudio, setCachedAudio } from "./cache";
import type { ExtractedAudio, Extractor } from "./extractor";
import { alternateFinder, type AlternateFinder } from "./alternate-source";
import { getAlternate, setAlternate } from "./alternates-store";
import { detailBlock, escapeHtml, messageTitle } from "../bot/message-format";
import { mapWithConcurrency } from "../core/concurrency";
import { extractionSemaphore } from "./ytdlp-limits";
import { fetchThumbnailBytes } from "./thumbnail";
import type { StreamResolver } from "./stream-resolver";
import {
  finalStatusFor,
  setDownloadStatus,
  setDownloadTracks,
  type DownloadRecord,
  type DownloadTrack,
} from "./downloads-store";

/** Bot API upload limit for sendAudio. */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export interface AudioMeta {
  title: string;
  performer: string;
  durationSeconds?: number;
  artworkUrl?: string;
  /**
   * Artwork fetch kicked off alongside extraction (see extractUploadCache
   * below), instead of telegram-sender.ts fetching it serially right before
   * sendAudio — by upload time it has usually already resolved. Falls back
   * to fetching `artworkUrl` fresh when absent.
   */
  artworkBytes?: Promise<Uint8Array | undefined>;
  /** Replies to a specific message instead of posting standalone (group keyword search). */
  replyToMessageId?: number;
  /** HTML caption shown under the audio (group keyword search only). */
  caption?: string;
}

/** Thin seam over grammY so delivery is testable without a live bot. */
export interface AudioSender {
  sendAudioByFileId(chatId: number, fileId: string, meta: AudioMeta): Promise<void>;
  /** Uploads a local file; resolves with the Telegram file_id for caching. */
  sendAudioFile(chatId: number, filePath: string, meta: AudioMeta): Promise<string>;
  /** Uploads bytes while they are still arriving from the upstream CDN. */
  sendAudioStream?(
    chatId: number,
    stream: AsyncIterable<Uint8Array>,
    filename: string,
    meta: AudioMeta,
  ): Promise<string>;
  sendText(chatId: number, text: string): Promise<void>;
}

export interface DeliverDeps {
  sender: AudioSender;
  extractor: Extractor;
  scratchDir: string;
  /** Cross-platform repair for unextractable tracks; defaults to the real search. */
  alternateFinder?: AlternateFinder;
  /** Enables the no-temp-file cold path; absence keeps the proven disk path. */
  streamResolver?: StreamResolver;
  streamFetch?: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => ReturnType<typeof fetch>;
}

const STREAM_UPLOAD_TIMEOUT_MS = 45_000;
const AUDIO_MIME_PATTERN = /^audio\/(?:mpeg|mp3|mp4|m4a|x-m4a|aac)(?:\s*;|$)/i;

function extensionForContentType(contentType: string, uri: string): string {
  if (/mpeg|mp3/i.test(contentType)) return "mp3";
  if (/mp4|m4a|aac/i.test(contentType)) return "m4a";
  return uri.startsWith("sc:") ? "mp3" : "m4a";
}

/**
 * Resolves the source once, then pipes its response body into Telegram's
 * multipart upload. Download and upload now overlap instead of taking turns.
 * Any uncertainty falls back to the existing file-based extractor below.
 */
async function tryStreamUpload(
  db: AppDb,
  chatId: number,
  track: DownloadTrack,
  deps: DeliverDeps,
  extraMeta?: Partial<AudioMeta>,
): Promise<boolean> {
  if (!deps.streamResolver || !deps.sender.sendAudioStream) return false;

  const artworkBytes = track.artwork ? fetchThumbnailBytes(track.artwork) : undefined;
  const resolveStart = performance.now();
  try {
    const resolved = await deps.streamResolver.resolve(track.uri);
    const resolveMs = performance.now() - resolveStart;
    const fetchStart = performance.now();
    const response = await (deps.streamFetch ?? fetch)(resolved.url, {
      headers: resolved.headers,
      signal: AbortSignal.timeout(STREAM_UPLOAD_TIMEOUT_MS),
    });
    const firstByteMs = performance.now() - fetchStart;
    if (!response.ok || !response.body) throw new Error(`upstream returned ${response.status}`);

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !AUDIO_MIME_PATTERN.test(contentType)) {
      await response.body.cancel().catch(() => {});
      throw new Error(`upstream returned non-audio content-type: ${contentType}`);
    }
    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;
    if (contentLength !== undefined && Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
      await response.body.cancel().catch(() => {});
      throw new Error(`upstream file too large for Telegram (${Math.round(contentLength / 1024 / 1024)} MB > 50 MB)`);
    }

    const uploadStart = performance.now();
    const fileId = await deps.sender.sendAudioStream(
      chatId,
      response.body as unknown as AsyncIterable<Uint8Array>,
      `${track.uri.replace(":", "_")}.${extensionForContentType(contentType, track.uri)}`,
      metaFor(track, undefined, { artworkBytes, ...extraMeta }),
    );
    const uploadMs = performance.now() - uploadStart;
    setCachedAudio(db, {
      uri: track.uri,
      tgFileId: fileId,
      title: track.title,
      artist: track.artist,
      durationMs: track.durationMs ?? null,
      sizeBytes: contentLength !== undefined && Number.isFinite(contentLength) ? contentLength : null,
    });
    console.info(
      `[deliver] ${track.uri} path=stream resolve=${Math.round(resolveMs)}ms ` +
        `firstbyte=${Math.round(firstByteMs)}ms upload=${Math.round(uploadMs)}ms ` +
        `size=${contentLength !== undefined && Number.isFinite(contentLength) ? (contentLength / 1024 / 1024).toFixed(1) + "MB" : "unknown"}`,
    );
    return true;
  } catch (e) {
    deps.streamResolver.invalidate(track.uri);
    console.info(
      `[deliver] ${track.uri} path=stream-fallback after=${Math.round(performance.now() - resolveStart)}ms ` +
        `reason=${e instanceof Error ? e.message.slice(0, 160) : String(e).slice(0, 160)}`,
    );
    return false;
  }
}

/**
 * `durationMs` on a track is what a search result claimed about the song, not
 * a fact about the audio being sent — the file can be a padded upload, a
 * different master picked up by the alternate source, or a preview that
 * replaced the full track after the playlist was generated. Telegram renders
 * its player from the duration we pass, so a measured length always wins and
 * the metadata is only the fallback.
 */
function metaFor(track: DownloadTrack, measuredSeconds?: number, extra?: Partial<AudioMeta>): AudioMeta {
  const metadataSeconds = track.durationMs != null ? Math.round(track.durationMs / 1000) : undefined;
  return {
    title: track.title,
    performer: track.artist,
    durationSeconds: measuredSeconds != null ? Math.round(measuredSeconds) : metadataSeconds,
    artworkUrl: track.artwork,
    ...extra,
  };
}

/**
 * Extracts the track's audio, falling back to the same song on another
 * platform when its own source has none — a pulled video or dead SoundCloud
 * id should cost the user a slightly different master, not a missing track.
 * A working substitution is remembered for playback too.
 *
 * `semWaitMs` is measured separately from the extraction itself: it's the
 * time spent queued for a free extractionSemaphore slot (shared with every
 * other download in flight), which is a different cost than yt-dlp's own
 * runtime and only visible at this call site.
 */
async function extractWithFallback(
  db: AppDb,
  track: DownloadTrack,
  deps: DeliverDeps,
): Promise<ExtractedAudio & { semWaitMs: number }> {
  const source = getAlternate(db, track.uri) ?? track.uri;
  const run = (uri: string) => {
    const waitStart = performance.now();
    return extractionSemaphore.run(async () => {
      const semWaitMs = performance.now() - waitStart;
      const extracted = await deps.extractor.extract(uri, deps.scratchDir);
      return { ...extracted, semWaitMs };
    });
  };
  try {
    return await run(source);
  } catch (e) {
    const meta = { title: track.title, artist: track.artist, durationMs: track.durationMs };
    const altUri = await (deps.alternateFinder ?? alternateFinder).find(track.uri, meta, { exclude: [source] });
    if (!altUri) throw e;
    const extracted = await run(altUri);
    setAlternate(db, track.uri, altUri, meta);
    console.info(`[download] ${track.uri} unextractable, used ${altUri} instead`);
    return extracted;
  }
}

async function extractUploadCache(
  db: AppDb,
  chatId: number,
  track: DownloadTrack,
  deps: DeliverDeps,
  extraMeta?: Partial<AudioMeta>,
): Promise<void> {
  // Started alongside extraction, not after it, so its latency overlaps
  // extraction instead of adding to it (see telegram-sender.ts).
  const artworkBytes = track.artwork ? fetchThumbnailBytes(track.artwork) : undefined;

  const extractStart = performance.now();
  const { filePath, sizeBytes, durationSeconds, semWaitMs, ytdlpMs, probeMs } = await extractWithFallback(db, track, deps);
  const extractMs = performance.now() - extractStart;
  try {
    if (sizeBytes > MAX_UPLOAD_BYTES) {
      throw new Error(`file too large for Telegram (${Math.round(sizeBytes / 1024 / 1024)} MB > 50 MB)`);
    }
    const uploadStart = performance.now();
    const fileId = await deps.sender.sendAudioFile(
      chatId,
      filePath,
      metaFor(track, durationSeconds, { artworkBytes, ...extraMeta }),
    );
    const uploadMs = performance.now() - uploadStart;
    console.info(
      `[deliver] ${track.uri} extract=${Math.round(extractMs)}ms ` +
        `(semwait=${Math.round(semWaitMs)}ms ytdlp=${Math.round(ytdlpMs ?? 0)}ms probe=${Math.round(probeMs ?? 0)}ms) ` +
        `upload=${Math.round(uploadMs)}ms size=${(sizeBytes / 1024 / 1024).toFixed(1)}MB`,
    );
    // The measured length is cached alongside the file_id so every later
    // re-send — which never touches the file again — is labelled with it too.
    setCachedAudio(db, {
      uri: track.uri,
      tgFileId: fileId,
      title: track.title,
      artist: track.artist,
      durationMs: durationSeconds != null ? Math.round(durationSeconds * 1000) : track.durationMs ?? null,
      sizeBytes,
    });
  } finally {
    await unlink(filePath).catch(() => {});
  }
}

/**
 * `extraMeta` overrides (e.g. `replyToMessageId`) apply to both the cache-hit
 * and extract+upload paths, but never persist — they describe this delivery,
 * not the track.
 */
export async function deliverTrack(
  db: AppDb,
  chatId: number,
  track: DownloadTrack,
  deps: DeliverDeps,
  extraMeta?: Partial<AudioMeta>,
): Promise<void> {
  const cached = getCachedAudio(db, track.uri);
  if (cached) {
    try {
      // cached.durationMs was measured off the very file this file_id points at
      // (older rows still hold the metadata value — no worse than before).
      const cachedSeconds = cached.durationMs != null ? cached.durationMs / 1000 : undefined;
      await deps.sender.sendAudioByFileId(chatId, cached.tgFileId, metaFor(track, cachedSeconds, extraMeta));
      return;
    } catch {
      // Telegram can expire file_ids — fall through to a fresh extract+upload,
      // which refreshes the cache row.
    }
  }

  // audio_cache is global, so cold preparation must be global too. If another
  // chat (or the background warmer) is already minting this URI's file_id,
  // wait for it and then send that id to this chat instead of downloading the
  // same bytes twice. The first delivery still reaches its own destination.
  const existing = coldDeliveries.get(track.uri);
  if (existing) {
    try {
      await existing;
      const prepared = getCachedAudio(db, track.uri);
      if (prepared) {
        const seconds = prepared.durationMs != null ? prepared.durationMs / 1000 : undefined;
        await deps.sender.sendAudioByFileId(chatId, prepared.tgFileId, metaFor(track, seconds, extraMeta));
        return;
      }
    } catch {
      // The owner failed; this caller gets one independent attempt below.
    }
  }

  const run = (async () => {
    if (await tryStreamUpload(db, chatId, track, deps, extraMeta)) return;
    await extractUploadCache(db, chatId, track, deps, extraMeta);
  })();
  coldDeliveries.set(track.uri, run);
  try {
    await run;
  } finally {
    if (coldDeliveries.get(track.uri) === run) coldDeliveries.delete(track.uri);
  }
}

const coldDeliveries = new Map<string, Promise<void>>();

function summaryText(playlistName: string, tracks: DownloadTrack[]): string {
  const sent = tracks.filter((t) => t.status === "sent").length;
  const name = escapeHtml(playlistName);
  if (sent === tracks.length) {
    return `${messageTitle("check", "Плейлист отправлен")}\n<b>${name}</b> · ${tracks.length} треков`;
  }
  const failed = tracks.filter((t) => t.status === "failed");
  const lines = failed.map((t) => `• ${escapeHtml(t.artist)} — ${escapeHtml(t.title)}`);
  if (sent === 0) {
    return `${messageTitle("cross", "Не удалось скачать плейлист")}\n<b>${name}</b>\n\n${detailBlock(lines)}`;
  }
  return `${messageTitle("warning", "Плейлист отправлен частично")}\n<b>${name}</b> · ${sent} из ${tracks.length}\n\n${detailBlock(lines)}`;
}

// How many tracks are delivered (cache-hit send or extract+upload) at once.
// Actual yt-dlp extraction is further capped process-wide by
// extractionSemaphore, so this only widens the win for cache-hit sends, which
// need no extraction slot.
const DELIVERY_CONCURRENCY = 3;

/**
 * Processes one download job: per-track cache-hit send or extract+upload,
 * up to DELIVERY_CONCURRENCY at once, tolerating individual failures, then a
 * summary message. Persists per-track status after each track completes so
 * progress survives restarts.
 */
export async function processDownload(db: AppDb, record: DownloadRecord, deps: DeliverDeps): Promise<void> {
  setDownloadStatus(db, record.id, "processing");
  const tracks = record.tracks.map((t) => ({ ...t }));

  await mapWithConcurrency(tracks, DELIVERY_CONCURRENCY, async (track) => {
    try {
      await deliverTrack(db, record.chatId, track, deps);
      track.status = "sent";
      delete track.error;
    } catch (e) {
      track.status = "failed";
      track.error = e instanceof Error ? e.message : String(e);
    }
    setDownloadTracks(db, record.id, tracks);
  });

  try {
    await deps.sender.sendText(record.chatId, summaryText(record.playlistName, tracks));
  } catch {
    // user may have blocked the bot — status still gets finalized below
  } finally {
    // Always runs, even if sendText throws something unexpected, so the row
    // can never wedge at "processing" past the end of this function.
    setDownloadStatus(db, record.id, finalStatusFor(tracks));
  }
}
