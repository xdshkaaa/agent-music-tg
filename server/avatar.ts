import { execFile } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ANIMATED_EXTS = new Set([".mp4", ".mov", ".gif"]);

export const AVATAR_DIR = path.resolve("data", "avatars");

export function isAnimatedAvatar(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ANIMATED_EXTS.has(ext);
}

let ffmpegAvailable: boolean | undefined;

async function checkFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== undefined) return ffmpegAvailable;
  try {
    await execFileAsync("ffmpeg", ["-version"], { timeout: 3000 });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

function ensureAvatarDir(): void {
  if (!existsSync(AVATAR_DIR)) {
    mkdirSync(AVATAR_DIR, { recursive: true });
  }
}

export function getCachedAvatarRelPath(fileUniqueId: string): string | null {
  const p = path.join(AVATAR_DIR, `${fileUniqueId}.jpg`);
  if (existsSync(p)) return `${fileUniqueId}.jpg`;
  return null;
}

/** Download a URL to a temp file and return its path. */
export async function downloadToTemp(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = path.join(AVATAR_DIR, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  ensureAvatarDir();
  await writeFile(tmp, buf);
  return tmp;
}

/** Convert a local animated file to a static JPEG. Returns the output path on success. */
export async function convertToStaticJpeg(inputPath: string, fileUniqueId: string): Promise<string | null> {
  if (!(await checkFfmpeg())) return null;

  ensureAvatarDir();
  const outputPath = path.join(AVATAR_DIR, `${fileUniqueId}.jpg`);

  if (existsSync(outputPath)) return outputPath;

  try {
    await execFileAsync("ffmpeg", [
      "-i", inputPath,
      "-vframes", "1",
      "-q:v", "2",
      "-y",
      outputPath,
    ], { timeout: 15000 });
    return outputPath;
  } catch {
    return null;
  } finally {
    try { unlinkSync(inputPath); } catch { /* temp file may already be gone */ }
  }
}
