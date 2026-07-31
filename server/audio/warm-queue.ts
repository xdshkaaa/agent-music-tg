import type { AppDb } from "../db";
import type { Track } from "../music/types";
import { getCachedAudio } from "./cache";
import type { DeliverDeps } from "./deliver";
import type { DownloadTrack } from "./downloads-store";
import { warmTrack } from "./warm-cache";

const MAX_QUEUE_SIZE = 100;
const MAX_STARTS_PER_MINUTE = 10;
const WINDOW_MS = 60_000;

interface WarmJob {
  db: AppDb;
  track: DownloadTrack;
  deps: DeliverDeps;
  storageChatId: number;
}

const queue: WarmJob[] = [];
const pendingUris = new Set<string>();
const starts: number[] = [];
let running = false;
let wakeTimer: ReturnType<typeof setTimeout> | undefined;

function toDownloadTrack(track: Track): DownloadTrack {
  return {
    uri: track.uri,
    title: track.title,
    artist: track.artist,
    durationMs: track.durationMs,
    artwork: track.artwork,
    status: "pending",
  };
}

function pruneStarts(now: number): void {
  while (starts.length > 0 && now - starts[0]! >= WINDOW_MS) starts.shift();
}

function scheduleDrain(delayMs = 0): void {
  if (wakeTimer) return;
  wakeTimer = setTimeout(() => {
    wakeTimer = undefined;
    void drain();
  }, delayMs);
}

async function drain(): Promise<void> {
  if (running || queue.length === 0) return;
  const now = Date.now();
  pruneStarts(now);
  if (starts.length >= MAX_STARTS_PER_MINUTE) {
    scheduleDrain(Math.max(1, WINDOW_MS - (now - starts[0]!)));
    return;
  }

  const job = queue.shift()!;
  running = true;
  starts.push(now);
  try {
    if (!getCachedAudio(job.db, job.track.uri)) {
      await warmTrack(job.db, job.track, job.deps, job.storageChatId);
    }
  } finally {
    pendingUris.delete(job.track.uri);
    running = false;
    scheduleDrain();
  }
}

/** Adds likely-to-be-selected tracks without delaying the search response. */
export function enqueueWarmTracks(
  db: AppDb,
  tracks: Track[],
  deps: DeliverDeps,
  storageChatId: number | null,
  count = 1,
): void {
  if (storageChatId === null) return;
  for (const track of tracks.slice(0, count)) {
    if (queue.length >= MAX_QUEUE_SIZE) break;
    if (pendingUris.has(track.uri) || getCachedAudio(db, track.uri)) continue;
    pendingUris.add(track.uri);
    queue.push({ db, track: toDownloadTrack(track), deps, storageChatId });
  }
  scheduleDrain();
}

/** Test seams for the process-wide queue. */
export async function __drainWarmQueueForTests(): Promise<void> {
  while (running || queue.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

export function __resetWarmQueueForTests(): void {
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = undefined;
  queue.length = 0;
  pendingUris.clear();
  starts.length = 0;
  running = false;
}
