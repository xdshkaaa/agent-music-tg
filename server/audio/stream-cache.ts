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
  // In-memory mirror of the cache dir's contents, keyed by filename, so hits
  // and evictions never need a readdirSync/statSync pass over the whole
  // directory — only the initial load does.
  private files = new Map<string, { size: number; mtimeMs: number }>();
  private totalBytes = 0;

  constructor(
    private readonly extractor: Extractor,
    private readonly options: StreamCacheOptions,
  ) {
    mkdirSync(options.dir, { recursive: true });
    for (const name of readdirSync(options.dir)) {
      try {
        const stat = statSync(join(options.dir, name));
        if (!stat.isFile()) continue;
        this.files.set(name, { size: stat.size, mtimeMs: stat.mtimeMs });
        this.totalBytes += stat.size;
      } catch {
        // raced with a delete — skip
      }
    }
  }

  /** Path to a playable file for the uri, extracting on miss. */
  async getFile(uri: string): Promise<string> {
    const name = fileNameForUri(uri);
    const path = join(this.options.dir, name);
    const now = new Date();
    // Stat the single file on disk (cheap) rather than trusting the in-memory
    // mtime — it must reflect the real file, not just what this process last
    // wrote, since ttl expiry is measured against actual mtime.
    try {
      const stat = statSync(path);
      const ageSeconds = (now.getTime() - stat.mtimeMs) / 1000;
      if (ageSeconds <= this.options.ttlSeconds) {
        utimesSync(path, now, now);
        this.files.set(name, { size: stat.size, mtimeMs: now.getTime() });
        return path;
      }
      await unlink(path).catch(() => {});
      const known = this.files.get(name);
      if (known) this.totalBytes -= known.size;
      this.files.delete(name);
    } catch {
      // miss
    }

    const pending = this.inflight.get(uri);
    if (pending) return pending;
    const run = (async () => {
      try {
        const { filePath, sizeBytes } = await this.extractor.extract(uri, this.options.dir);
        this.files.set(name, { size: sizeBytes, mtimeMs: Date.now() });
        this.totalBytes += sizeBytes;
        await this.evict();
        return filePath;
      } finally {
        this.inflight.delete(uri);
      }
    })();
    this.inflight.set(uri, run);
    return run;
  }

  /** Deletes expired files, then LRU-trims until under the size cap — all from the in-memory index. */
  async evict(): Promise<void> {
    const nowMs = Date.now();
    for (const [name, entry] of this.files) {
      if ((nowMs - entry.mtimeMs) / 1000 > this.options.ttlSeconds) {
        await unlink(join(this.options.dir, name)).catch(() => {});
        this.totalBytes -= entry.size;
        this.files.delete(name);
      }
    }
    if (this.totalBytes <= this.options.maxBytes) return;
    const byAge = [...this.files.entries()].sort((a, b) => a[1].mtimeMs - b[1].mtimeMs);
    for (const [name, entry] of byAge) {
      if (this.totalBytes <= this.options.maxBytes) break;
      await unlink(join(this.options.dir, name)).catch(() => {});
      this.totalBytes -= entry.size;
      this.files.delete(name);
    }
  }
}
