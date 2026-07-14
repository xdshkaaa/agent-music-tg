import { mkdirSync, readdirSync, statSync, utimesSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { fileNameForUri, type Extractor } from "./extractor";

export interface StreamCacheOptions {
  dir: string;
  maxBytes: number;
  ttlSeconds: number;
}

/**
 * On-disk LRU cache backing the in-app streaming endpoint. Files are mp3s
 * named after their track uri; recency comes from mtime (bumped on access).
 * Extraction is deduplicated per uri so concurrent plays of the same track
 * trigger a single yt-dlp run.
 */
export class StreamCache {
  private inflight = new Map<string, Promise<string>>();

  constructor(
    private readonly extractor: Extractor,
    private readonly options: StreamCacheOptions,
  ) {
    mkdirSync(options.dir, { recursive: true });
  }

  /** Path to a playable file for the uri, extracting on miss. */
  async getFile(uri: string): Promise<string> {
    const path = join(this.options.dir, fileNameForUri(uri));
    const now = new Date();
    try {
      const stat = statSync(path);
      const ageSeconds = (now.getTime() - stat.mtimeMs) / 1000;
      if (ageSeconds <= this.options.ttlSeconds) {
        utimesSync(path, now, now);
        return path;
      }
      await unlink(path).catch(() => {});
    } catch {
      // miss
    }

    const pending = this.inflight.get(uri);
    if (pending) return pending;
    const run = (async () => {
      try {
        const { filePath } = await this.extractor.extract(uri, this.options.dir);
        await this.evict();
        return filePath;
      } finally {
        this.inflight.delete(uri);
      }
    })();
    this.inflight.set(uri, run);
    return run;
  }

  /** Deletes expired files, then LRU-trims until under the size cap. */
  async evict(): Promise<void> {
    const nowMs = Date.now();
    let entries: { path: string; size: number; mtimeMs: number }[] = [];
    for (const name of readdirSync(this.options.dir)) {
      const path = join(this.options.dir, name);
      try {
        const stat = statSync(path);
        if (!stat.isFile()) continue;
        if ((nowMs - stat.mtimeMs) / 1000 > this.options.ttlSeconds) {
          await unlink(path).catch(() => {});
          continue;
        }
        entries.push({ path, size: stat.size, mtimeMs: stat.mtimeMs });
      } catch {
        // raced with a delete — skip
      }
    }
    let total = entries.reduce((sum, e) => sum + e.size, 0);
    entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const entry of entries) {
      if (total <= this.options.maxBytes) break;
      await unlink(entry.path).catch(() => {});
      total -= entry.size;
    }
  }
}
