import { PROGRESSIVE_AUDIO_FORMAT, sourceUrlForUri } from "./extractor";
import { streamResolveSemaphore } from "./ytdlp-limits";

export interface ResolvedStream {
  url: string;
  headers: Record<string, string>;
}

export interface StreamResolver {
  resolve(uri: string): Promise<ResolvedStream>;
  invalidate(uri: string): void;
  /**
   * Whether `resolve` would answer from cache — i.e. without spawning yt-dlp.
   * Optional so lightweight test doubles need not implement it.
   */
  isCached?(uri: string): boolean;
}

export interface YtDlpStreamResolverOptions {
  binary?: string;
  ttlMs?: number;
  timeoutMs?: number;
}

/** Only used when the upstream URL carries no expiry of its own. */
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 12_000;
const EXPIRY_SAFETY_MS = 60_000;
/** Ceiling on a self-described expiry, so one entry can't outlive a deploy's worth of listening. */
const MAX_TTL_MS = 6 * 60 * 60 * 1000;
/** Cache is keyed by track uri and holds only a URL plus headers; this bounds it anyway. */
const MAX_CACHE_ENTRIES = 2_000;
/**
 * extractor.ts's format restricted to m4a/mp3 covers the common case. Unlike
 * that module, this one only ever proxies bytes rather than downloading a
 * whole file, so it's safe here to widen with a last-resort "any progressive
 * http format" fallback instead of failing resolution outright.
 */
const STREAM_AUDIO_FORMAT = `${PROGRESSIVE_AUDIO_FORMAT}/bestaudio[protocol^=http][protocol!*=m3u8]`;

interface CachedStream {
  value: ResolvedStream;
  expiresAt: number;
}

export class YtDlpStreamResolver implements StreamResolver {
  private readonly binary: string;
  private readonly ttlMs: number;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, CachedStream>();
  private readonly inflight = new Map<string, Promise<ResolvedStream>>();

  constructor(options: YtDlpStreamResolverOptions = {}) {
    this.binary = options.binary ?? "yt-dlp";
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async resolve(uri: string): Promise<ResolvedStream> {
    const cached = this.cache.get(uri);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    this.cache.delete(uri);

    const pending = this.inflight.get(uri);
    if (pending) return pending;
    const run = this.resolveFresh(uri).finally(() => this.inflight.delete(uri));
    this.inflight.set(uri, run);
    return run;
  }

  invalidate(uri: string): void {
    this.cache.delete(uri);
  }

  isCached(uri: string): boolean {
    const cached = this.cache.get(uri);
    if (!cached) return false;
    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(uri);
      return false;
    }
    return true;
  }

  private resolveFresh(uri: string): Promise<ResolvedStream> {
    // Every resolve spawns yt-dlp plus a Node runtime. `inflight` only
    // deduplicates identical URIs, so without this a caller walking distinct
    // URIs would spawn one process per request.
    return streamResolveSemaphore.run(() => this.spawnResolve(uri));
  }

  private async spawnResolve(uri: string): Promise<ResolvedStream> {
    const proc = Bun.spawn(
      [
        this.binary,
        "--no-playlist",
        "--quiet",
        "--js-runtimes", "node",
        "-f", STREAM_AUDIO_FORMAT,
        "--no-download",
        "--dump-single-json",
        sourceUrlForUri(uri),
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const timer = setTimeout(() => proc.kill(), this.timeoutMs);
    let stdout: string;
    let stderr: string;
    let code: number;
    try {
      [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (code !== 0) {
      const detail = proc.killed ? "timed out" : stderr.trim().slice(0, 500);
      throw new Error(`yt-dlp stream resolve failed for ${uri} (exit ${code}): ${detail}`);
    }

    let data: unknown;
    try {
      data = JSON.parse(stdout);
    } catch {
      throw new Error(`yt-dlp stream resolve returned invalid JSON for ${uri}`);
    }
    const ytDlpResult = data as Record<string, unknown>;
    const selectedDownload = Array.isArray(ytDlpResult.requested_downloads)
      ? (ytDlpResult.requested_downloads[0] as Record<string, unknown> | undefined)
      : undefined;
    const url = selectedDownload?.url ?? ytDlpResult.url;
    if (typeof url !== "string" || !url.startsWith("http")) {
      throw new Error(`yt-dlp stream resolve returned no playable URL for ${uri}`);
    }
    const rawHeaders = selectedDownload?.http_headers ?? ytDlpResult.http_headers;
    const headers: Record<string, string> = {};
    if (rawHeaders && typeof rawHeaders === "object") {
      for (const [name, value] of Object.entries(rawHeaders)) {
        if (typeof value === "string") headers[name] = value;
      }
    }

    const resolvedStream = { url, headers };
    // The URL states its own lifetime (googlevideo `expire` is typically ~6h).
    // Clamping that down to ttlMs meant re-spawning yt-dlp every 10 minutes for
    // a URL that was still perfectly good — a 1-3s stall mid-listening-session,
    // and a semaphore slot taken from someone else's first tap. ttlMs now only
    // covers URLs that carry no expiry at all.
    const upstreamExpiry = Number(new URL(url).searchParams.get("expire")) * 1000 - EXPIRY_SAFETY_MS;
    const expiresAt = Number.isFinite(upstreamExpiry) && upstreamExpiry > Date.now()
      ? Math.min(upstreamExpiry, Date.now() + MAX_TTL_MS)
      : Date.now() + this.ttlMs;
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(uri, { value: resolvedStream, expiresAt });
    return resolvedStream;
  }
}
