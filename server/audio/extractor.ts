import { mkdirSync } from "node:fs";
import { join } from "node:path";

/** Only track URIs this app itself resolved — never arbitrary URLs. */
const URI_PATTERN = /^(ytm|sc):[\w-]+$/;

export function isValidTrackUri(uri: string): boolean {
  return URI_PATTERN.test(uri);
}

/** Maps a track uri to the source URL yt-dlp downloads from. */
export function sourceUrlForUri(uri: string): string {
  if (!isValidTrackUri(uri)) throw new Error(`invalid track uri: ${uri}`);
  const [scheme, id] = uri.split(":") as [string, string];
  if (scheme === "ytm") return `https://music.youtube.com/watch?v=${id}`;
  return `https://api.soundcloud.com/tracks/${id}`;
}

/** Filesystem-safe name for a uri (":" is not portable in filenames). */
export function fileNameForUri(uri: string): string {
  return `${uri.replace(":", "_")}.mp3`;
}

export interface ExtractedAudio {
  filePath: string;
  sizeBytes: number;
}

export interface ProbeResult {
  available: boolean;
  reason?: string;
}

export interface Extractor {
  extract(uri: string, targetDir: string): Promise<ExtractedAudio>;
  probe(uri: string): Promise<ProbeResult>;
}

const PROBE_TIMEOUT_MS = 15_000;
const EXTRACT_TIMEOUT_MS = 45_000;

/** Kills proc if it doesn't exit within timeoutMs; returns its exit code either way. */
async function waitWithTimeout(proc: { exited: Promise<number>; kill: () => void }, timeoutMs: number): Promise<number> {
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  try {
    return await proc.exited;
  } finally {
    clearTimeout(timer);
  }
}

async function runProbe(uri: string): Promise<ProbeResult> {
  const url = sourceUrlForUri(uri);
  const proc = Bun.spawn(
    ["yt-dlp", "--no-playlist", "--quiet", "--js-runtimes", "node", "-f", "bestaudio/best", "--dump-json", url],
    { stdout: "pipe", stderr: "pipe" },
  );
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await waitWithTimeout(proc, PROBE_TIMEOUT_MS);

  if (code !== 0) {
    const msg = stderr.trim().slice(0, 300);
    if (
      msg.includes("Video unavailable") ||
      msg.includes("Private video") ||
      msg.includes("age-restricted") ||
      msg.includes("removed") ||
      msg.includes("copyright") ||
      msg.includes("This video is not available") ||
      msg.includes("HTTP Error 404") ||
      msg.includes("HTTP Error 403")
    ) {
      return { available: false, reason: msg };
    }
    return { available: false, reason: msg };
  }

  try {
    const data = JSON.parse(stdout);
    if (data?.availability && data.availability !== "public") {
      return { available: false, reason: `availability: ${data.availability}` };
    }
    return { available: true };
  } catch {
    return { available: false, reason: "failed to parse yt-dlp output" };
  }
}

/**
 * Extracts a track's audio as mp3 into targetDir via a yt-dlp subprocess.
 * 192k keeps typical songs a few MB — far under the Bot API 50 MB limit.
 */
export class YtDlpExtractor implements Extractor {
  async extract(uri: string, targetDir: string): Promise<ExtractedAudio> {
    const url = sourceUrlForUri(uri);
    mkdirSync(targetDir, { recursive: true });
    const filePath = join(targetDir, fileNameForUri(uri));

    const proc = Bun.spawn(
      [
        "yt-dlp",
        "--no-playlist",
        "--quiet",
        "--js-runtimes", "node",
        "-f", "bestaudio/best",
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "192K",
        "--embed-thumbnail",
        "--embed-metadata",
        "--convert-thumbnails", "jpg",
        "-o", filePath.replace(/\.mp3$/, ".%(ext)s"),
        url,
      ],
      { stdout: "ignore", stderr: "pipe" },
    );
    const stderr = await new Response(proc.stderr).text();
    const code = await waitWithTimeout(proc, EXTRACT_TIMEOUT_MS);
    if (code !== 0) {
      const timedOut = proc.killed;
      const detail = timedOut ? "timed out" : stderr.trim().slice(0, 500);
      throw new Error(`yt-dlp failed for ${uri} (exit ${code}): ${detail}`);
    }

    const file = Bun.file(filePath);
    if (!(await file.exists())) throw new Error(`yt-dlp produced no file for ${uri}`);
    return { filePath, sizeBytes: file.size };
  }

  async probe(uri: string): Promise<ProbeResult> {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1000));
      try {
        const result = await runProbe(uri);
        if (attempt === 0 || result.available === false) return result;
        return result;
      } catch {
        if (attempt === 2) return { available: false, reason: "probe failed after 3 attempts" };
      }
    }
    return { available: false, reason: "probe failed" };
  }
}
