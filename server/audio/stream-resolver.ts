import { sourceUrlForUri } from "./extractor";

export interface ResolvedStream {
  url: string;
  headers: Record<string, string>;
}

export interface StreamResolver {
  resolve(uri: string): Promise<ResolvedStream>;
  invalidate(uri: string): void;
}

export interface YtDlpStreamResolverOptions {
  binary?: string;
  ttlMs?: number;
  timeoutMs?: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 12_000;
const EXPIRY_SAFETY_MS = 60_000;

interface CachedStream {
  value: ResolvedStream;
  expiresAt: number;
}

/** Resolves signed upstream audio URLs without downloading or transcoding the track. */
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

  private async resolveFresh(uri: string): Promise<ResolvedStream> {
    const proc = Bun.spawn(
      [
        this.binary,
        "--no-playlist",
        "--quiet",
        "--js-runtimes", "node",
        "-f", "bestaudio[ext=m4a]/bestaudio/best",
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
    const root = data as Record<string, unknown>;
    const selected = Array.isArray(root.requested_downloads)
      ? (root.requested_downloads[0] as Record<string, unknown> | undefined)
      : undefined;
    const url = selected?.url ?? root.url;
    if (typeof url !== "string" || !url.startsWith("http")) {
      throw new Error(`yt-dlp stream resolve returned no playable URL for ${uri}`);
    }
    const rawHeaders = selected?.http_headers ?? root.http_headers;
    const headers: Record<string, string> = {};
    if (rawHeaders && typeof rawHeaders === "object") {
      for (const [name, value] of Object.entries(rawHeaders)) {
        if (typeof value === "string") headers[name] = value;
      }
    }

    const value = { url, headers };
    const upstreamExpiry = Number(new URL(url).searchParams.get("expire")) * 1000 - EXPIRY_SAFETY_MS;
    const ttlExpiry = Date.now() + this.ttlMs;
    const expiresAt = Number.isFinite(upstreamExpiry) && upstreamExpiry > Date.now()
      ? Math.min(ttlExpiry, upstreamExpiry)
      : ttlExpiry;
    this.cache.set(uri, { value, expiresAt });
    return value;
  }
}
