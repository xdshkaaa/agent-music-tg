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
  // www.youtube.com, not music.youtube.com: same video, one fewer
  // redirect/consent hop for yt-dlp to resolve on every single extraction.
  if (scheme === "ytm") return `https://www.youtube.com/watch?v=${id}`;
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
  /** Wall time of the yt-dlp subprocess (download, plus a transcode on the rare fallback attempt). Diagnostics only. */
  ytdlpMs?: number;
  /** Wall time of the ffprobe subprocess. Diagnostics only. */
  probeMs?: number;
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

/**
 * Progressive (non-HLS) audio-only format: m4a preferred, mp3 fallback.
 * Telegram plays both natively as music — no ffmpeg re-encode needed on this
 * app's side. Shared with stream-resolver.ts, which resolves a playback URL
 * rather than downloading a file, so it appends its own broader last-resort
 * fallback on top instead of the filesize cap this module adds below.
 */
export const PROGRESSIVE_AUDIO_FORMAT =
  "bestaudio[ext=m4a][protocol^=http][protocol!*=m3u8]/" +
  "bestaudio[ext=mp3][protocol^=http][protocol!*=m3u8]";

/**
 * PROGRESSIVE_AUDIO_FORMAT with each alternative capped at the Bot API
 * upload limit. Unlike stream-resolver.ts, this module downloads the whole
 * file, so a format above the limit is worse than useless here — it would
 * just be rejected after the fact by deliver.ts's MAX_UPLOAD_BYTES check.
 * The `?` on `filesize<?50M` is required, or formats with an unknown size
 * (the common case on YouTube) would be excluded outright instead of passed
 * through.
 */
const DOWNLOAD_AUDIO_FORMAT = PROGRESSIVE_AUDIO_FORMAT.split("/")
  .map((alt) => `${alt}[filesize<?50M]`)
  .join("/");

/** yt-dlp's exit message when a source has neither candidate in DOWNLOAD_AUDIO_FORMAT. */
const FORMAT_UNAVAILABLE_MARKER = "Requested format is not available";

/**
 * Persists yt-dlp's own cache (nsig solutions, extractor/player-JS state)
 * across invocations. The systemd units don't set `User=`, so `$HOME` isn't
 * guaranteed present — without an explicit --cache-dir, yt-dlp can fall back
 * to a guessed location and end up re-solving the YouTube player on every
 * single call instead of reusing what it already worked out.
 */
const YTDLP_CACHE_DIR = join(process.cwd(), "data", ".yt-dlp-cache");

/** Flags common to every yt-dlp invocation in this module. */
const COMMON_ARGS = [
  "--no-playlist",
  "--quiet",
  "--no-warnings",
  "--js-runtimes", "node",
  "--socket-timeout", "10",
  "--cache-dir", YTDLP_CACHE_DIR,
];

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
    ["yt-dlp", ...COMMON_ARGS, "-f", "bestaudio/best", "--dump-json", url],
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

interface RunExtractResult {
  code: number;
  stderr: string;
  filePath?: string;
  timedOut: boolean;
}

/**
 * Runs one yt-dlp download attempt against `format`, printing the final file
 * path after any post-processing so the caller never has to guess which
 * extension yt-dlp picked. `--print` implies `--simulate`, hence
 * `--no-simulate` to still actually download. `transcode` re-encodes to mp3
 * — only used by the fallback attempt below, for sources offering neither
 * m4a nor mp3 progressively.
 */
async function runExtractOnce(url: string, outputTemplate: string, format: string, transcode: boolean): Promise<RunExtractResult> {
  const proc = Bun.spawn(
    [
      "yt-dlp",
      ...COMMON_ARGS,
      "--concurrent-fragments", "4",
      "-f", format,
      ...(transcode ? ["-x", "--audio-format", "mp3", "--audio-quality", "192K"] : []),
      "--no-simulate",
      "--print", "after_move:%(filepath)s",
      "-o", outputTemplate,
      url,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const { stdout, stderr, code } = await runWithTimeout(proc, EXTRACT_TIMEOUT_MS);
  return {
    code,
    stderr,
    filePath: stdout.trim().split("\n").filter(Boolean).pop(),
    timedOut: proc.killed,
  };
}

/**
 * Extracts a track's audio via a yt-dlp subprocess, preferring an
 * already-compressed progressive stream (m4a/mp3) so Telegram receives it
 * as-is: no ffmpeg re-encode pass, which used to run unconditionally on
 * every extraction regardless of source, only ever making the upload bigger
 * and slower for a "quality" the source never had. Falls back to the old
 * download+transcode behavior only when a source truly offers neither.
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
    const outputTemplate = join(targetDir, fileNameForUri(uri)).replace(/\.mp3$/, ".%(ext)s");

    const ytdlpStart = performance.now();
    let result = await runExtractOnce(url, outputTemplate, DOWNLOAD_AUDIO_FORMAT, false);
    if (result.code !== 0 && !result.timedOut && result.stderr.includes(FORMAT_UNAVAILABLE_MARKER)) {
      result = await runExtractOnce(url, outputTemplate, "bestaudio/best", true);
    }
    const ytdlpMs = performance.now() - ytdlpStart;

    if (result.code !== 0 || !result.filePath) {
      const detail = result.timedOut ? "timed out" : result.stderr.trim().slice(0, 500);
      throw new Error(`yt-dlp failed for ${uri} (exit ${result.code}): ${detail}`);
    }

    const file = Bun.file(result.filePath);
    if (!(await file.exists())) throw new Error(`yt-dlp produced no file for ${uri}`);

    const probeStart = performance.now();
    const durationSeconds = await probeFileDuration(result.filePath);
    const probeMs = performance.now() - probeStart;

    return { filePath: result.filePath, sizeBytes: file.size, durationSeconds, ytdlpMs, probeMs };
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
