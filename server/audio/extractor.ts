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
  /** Measured from the produced file; undefined when ffprobe couldn't read it. */
  durationSeconds?: number;
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
const FFPROBE_TIMEOUT_MS = 10_000;

interface SpawnedProc {
  stdout?: ReadableStream<Uint8Array> | number;
  stderr?: ReadableStream<Uint8Array> | number;
  exited: Promise<number>;
  kill: () => void;
}

function readPipe(pipe: SpawnedProc["stdout"]): Promise<string> {
  // "ignore"/"inherit" hand back a number instead of a stream.
  if (!pipe || typeof pipe === "number") return Promise.resolve("");
  return new Response(pipe).text();
}

/**
 * Runs proc to completion, killing it if it outlives timeoutMs.
 *
 * The kill timer is armed *before* the pipes are drained, and the drains are
 * awaited together with `exited`. Reading a pipe to EOF first would mean a
 * yt-dlp that stalls with its pipes still open never reaches the timeout at
 * all — and both callers run inside a semaphore of 2-4 slots (ytdlp-limits.ts),
 * so a single hung process permanently removed capacity for every user.
 */
async function runWithTimeout(
  proc: SpawnedProc,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  try {
    const [stdout, stderr, code] = await Promise.all([
      readPipe(proc.stdout),
      readPipe(proc.stderr),
      proc.exited,
    ]);
    return { stdout, stderr, code };
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
  const { stdout, stderr, code } = await runWithTimeout(proc, PROBE_TIMEOUT_MS);

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
 * How long the extracted file actually plays, per ffprobe.
 *
 * A track's `durationMs` is a claim copied from a search result — it describes
 * the song, not the file yt-dlp ended up with. Those diverge often enough to
 * matter: a padded upload, a different master reached through the alternate
 * source, or a SoundCloud track that has since become a 30-second preview.
 * Telegram draws its player from the duration we send, so the number has to
 * come from the bytes we are about to upload. Best-effort: never throws, and a
 * missing ffprobe just means the caller keeps using the metadata it had.
 */
async function probeFileDuration(filePath: string): Promise<number | undefined> {
  try {
    const proc = Bun.spawn(
      ["ffprobe", "-v", "error", "-show_entries", "format=duration",
       "-of", "default=noprint_wrappers=1:nokey=1", filePath],
      { stdout: "pipe", stderr: "pipe" },
    );
    const { stdout, code } = await runWithTimeout(proc, FFPROBE_TIMEOUT_MS);
    if (code !== 0) return undefined;
    const seconds = Number(stdout.trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extracts a track's audio as mp3 into targetDir via a yt-dlp subprocess.
 * 192k keeps typical songs a few MB — far under the Bot API 50 MB limit.
 *
 * No `--embed-thumbnail`/`--embed-metadata`: telegram-sender.ts already sends
 * title/performer/duration/thumbnail as explicit sendAudio params, and the
 * extracted file is deleted right after upload (deliver.ts) — nothing ever
 * reads its ID3 tags. Embedding cost a thumbnail download plus an extra
 * ffmpeg mux pass on every cache-miss track for no one.
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
        "-o", filePath.replace(/\.mp3$/, ".%(ext)s"),
        url,
      ],
      { stdout: "ignore", stderr: "pipe" },
    );
    const { stderr, code } = await runWithTimeout(proc, EXTRACT_TIMEOUT_MS);
    if (code !== 0) {
      const timedOut = proc.killed;
      const detail = timedOut ? "timed out" : stderr.trim().slice(0, 500);
      throw new Error(`yt-dlp failed for ${uri} (exit ${code}): ${detail}`);
    }

    const file = Bun.file(filePath);
    if (!(await file.exists())) throw new Error(`yt-dlp produced no file for ${uri}`);
    return { filePath, sizeBytes: file.size, durationSeconds: await probeFileDuration(filePath) };
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
