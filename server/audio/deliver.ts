import { unlink } from "node:fs/promises";
import type { AppDb } from "../db";
import { getCachedAudio, setCachedAudio } from "./cache";
import type { Extractor } from "./extractor";
import { detailBlock, escapeHtml, messageTitle } from "../bot/message-format";
import { mapWithConcurrency } from "../core/concurrency";
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
}

/** Thin seam over grammY so delivery is testable without a live bot. */
export interface AudioSender {
  sendAudioByFileId(chatId: number, fileId: string, meta: AudioMeta): Promise<void>;
  /** Uploads a local file; resolves with the Telegram file_id for caching. */
  sendAudioFile(chatId: number, filePath: string, meta: AudioMeta): Promise<string>;
  sendText(chatId: number, text: string): Promise<void>;
}

export interface DeliverDeps {
  sender: AudioSender;
  extractor: Extractor;
  scratchDir: string;
  /** Max simultaneous yt-dlp extractions across all jobs. */
  maxConcurrentExtractions?: number;
}

// Global extraction semaphore: protects the VPS CPU/disk regardless of how
// many user jobs run. FIFO queue of waiters.
let running = 0;
const waiters: (() => void)[] = [];

async function withExtractionSlot<T>(cap: number, fn: () => Promise<T>): Promise<T> {
  if (running >= cap) await new Promise<void>((resolve) => waiters.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiters.shift()?.();
  }
}

function metaFor(track: DownloadTrack): AudioMeta {
  return {
    title: track.title,
    performer: track.artist,
    durationSeconds: track.durationMs != null ? Math.round(track.durationMs / 1000) : undefined,
    artworkUrl: track.artwork,
  };
}

async function extractUploadCache(
  db: AppDb,
  chatId: number,
  track: DownloadTrack,
  deps: DeliverDeps,
): Promise<void> {
  const cap = deps.maxConcurrentExtractions ?? 2;
  const { filePath, sizeBytes } = await withExtractionSlot(cap, () =>
    deps.extractor.extract(track.uri, deps.scratchDir),
  );
  try {
    if (sizeBytes > MAX_UPLOAD_BYTES) {
      throw new Error(`file too large for Telegram (${Math.round(sizeBytes / 1024 / 1024)} MB > 50 MB)`);
    }
    const fileId = await deps.sender.sendAudioFile(chatId, filePath, metaFor(track));
    setCachedAudio(db, {
      uri: track.uri,
      tgFileId: fileId,
      title: track.title,
      artist: track.artist,
      durationMs: track.durationMs ?? null,
      sizeBytes,
    });
  } finally {
    await unlink(filePath).catch(() => {});
  }
}

export async function deliverTrack(db: AppDb, chatId: number, track: DownloadTrack, deps: DeliverDeps): Promise<void> {
  const cached = getCachedAudio(db, track.uri);
  if (cached) {
    try {
      await deps.sender.sendAudioByFileId(chatId, cached.tgFileId, metaFor(track));
      return;
    } catch {
      // Telegram can expire file_ids — fall through to a fresh extract+upload,
      // which refreshes the cache row.
    }
  }
  await extractUploadCache(db, chatId, track, deps);
}

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
// Actual yt-dlp extraction is further capped by deps.maxConcurrentExtractions
// (default 2) via withExtractionSlot, so this only widens the win for
// cache-hit sends, which need no extraction slot.
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
